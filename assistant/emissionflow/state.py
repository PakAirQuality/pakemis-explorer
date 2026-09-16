"""Single-host, persistent admission accounting. Share this DB across local workers.
Do not put SQLite on a network filesystem or launch independent replicas with separate DBs.
"""
from __future__ import annotations
from contextlib import contextmanager
from datetime import datetime,timezone
import hashlib,hmac,json,sqlite3,time,uuid
from pathlib import Path

class State:
    def __init__(self,path:Path,secret:str):
        self.path=path;self.secret=secret.encode();path.parent.mkdir(parents=True,exist_ok=True)
        with self.connection() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.executescript('''
            CREATE TABLE IF NOT EXISTS calls (id TEXT PRIMARY KEY, month TEXT NOT NULL, day TEXT NOT NULL, client TEXT NOT NULL, reserved INTEGER NOT NULL, charged INTEGER, status TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS switches (name TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS rates (bucket TEXT PRIMARY KEY, window INTEGER NOT NULL, n INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, payload TEXT NOT NULL, created REAL NOT NULL);
            ''')

    @contextmanager
    def connection(self):
        db=sqlite3.connect(self.path,timeout=10,isolation_level=None)
        try:yield db
        finally:db.close()

    def client_id(self,peer:str,now:float|None=None)->str:
        day=datetime.fromtimestamp(time.time() if now is None else now,timezone.utc).strftime('%Y-%m-%d')
        return hmac.new(self.secret,f'{day}|{peer}'.encode(),hashlib.sha256).hexdigest()

    def admit_rate(self,client:str,limit:int,now:float|None=None)->bool:
        window=int((time.time() if now is None else now)//60)
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT window,n FROM rates WHERE bucket=?',(client,)).fetchone()
            n=row[1] if row and row[0]==window else 0
            if n>=limit:db.execute('ROLLBACK');return False
            db.execute('INSERT OR REPLACE INTO rates VALUES (?,?,?)',(client,window,n+1))
            db.execute('DELETE FROM rates WHERE window<?',(window-2,))
            db.execute('COMMIT');return True

    def reserve(self,client:str,amount:int,cap:int,daily_limit:int,now:float|None=None)->str|None:
        if cap<=0 or amount<=0:return None
        dt=datetime.fromtimestamp(time.time() if now is None else now,timezone.utc)
        month=dt.strftime('%Y-%m');day=dt.strftime('%Y-%m-%d')
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute("SELECT 1 FROM switches WHERE name='billing_circuit_open'").fetchone():db.execute('ROLLBACK');return None
            used=db.execute('SELECT COALESCE(SUM(COALESCE(charged,reserved)),0) FROM calls WHERE month=?',(month,)).fetchone()[0]
            count=db.execute('SELECT COUNT(*) FROM calls WHERE day=? AND client=?',(day,client)).fetchone()[0]
            if used+amount>cap or count>=daily_limit:db.execute('ROLLBACK');return None
            id=uuid.uuid4().hex
            db.execute('INSERT INTO calls VALUES (?,?,?,?,?,NULL,?)',(id,month,day,client,amount,'reserved'))
            db.execute('COMMIT');return id

    def settle(self,id:str,actual:int|None):
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT reserved,status FROM calls WHERE id=?',(id,)).fetchone()
            if not row:db.execute('ROLLBACK');raise ValueError('Unknown reservation')
            if row[1]!='reserved':db.execute('ROLLBACK');return
            charge=row[0] if actual is None else max(0,actual)
            status='unknown_cost' if actual is None else 'settled'
            db.execute('UPDATE calls SET charged=?,status=? WHERE id=?',(charge,status,id))
            if charge>row[0]:db.execute("INSERT OR REPLACE INTO switches VALUES ('billing_circuit_open','actual cost exceeded reservation; reconcile provider bill before resetting')")
            db.execute('COMMIT')
        # A crash leaves the reservation charged against admission capacity. Never
        # auto-refund a timed-out/unfinished provider request that may have been billed.

    def summary(self,now:float|None=None):
        month=datetime.fromtimestamp(time.time() if now is None else now,timezone.utc).strftime('%Y-%m')
        with self.connection() as db:
            used,calls=db.execute('SELECT COALESCE(SUM(COALESCE(charged,reserved)),0),COUNT(*) FROM calls WHERE month=?',(month,)).fetchone()
            circuit=bool(db.execute("SELECT 1 FROM switches WHERE name='billing_circuit_open'").fetchone())
        return {'billing_month_utc':month,'accounted_micro_usd':used,'admitted_calls':calls,'circuit_open':circuit}

    def cache_get(self,key:str):
        with self.connection() as db:row=db.execute('SELECT payload FROM cache WHERE key=?',(key,)).fetchone()
        return json.loads(row[0]) if row else None

    def cache_put(self,key:str,payload:dict):
        with self.connection() as db:
            db.execute('INSERT OR REPLACE INTO cache VALUES (?,?,?)',(key,json.dumps(payload,ensure_ascii=False),time.time()))
            # Bound storage. Entries contain approved card text/context, never questions.
            db.execute('DELETE FROM cache WHERE key IN (SELECT key FROM cache ORDER BY created DESC LIMIT -1 OFFSET 2000)')
