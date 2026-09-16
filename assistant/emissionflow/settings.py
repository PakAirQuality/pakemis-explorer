from __future__ import annotations
from dataclasses import dataclass
from decimal import Decimal, ROUND_CEILING
from pathlib import Path
import os


def micro_usd(value:str)->int:
    v=Decimal(value)
    if not v.is_finite() or v<0:raise ValueError('Budget must be finite and non-negative')
    return int((v*1_000_000).to_integral_value(rounding=ROUND_CEILING))

@dataclass
class Settings:
    root:Path
    state_path:Path
    production:bool=False
    allow_paid:bool=False
    api_key:str=''
    monthly_cap:int=0
    reservation:int=20_000  # $0.02 per admitted selector call, reconciled after use.
    model:str='gemini-3.1-flash-lite'
    input_rate:Decimal=Decimal('0.25')
    output_rate:Decimal=Decimal('1.50')
    max_input_bytes:int=20_000
    max_output_tokens:int=512
    timeout_seconds:float=12.
    client_daily_paid_limit:int=5
    minute_rate_limit:int=20
    state_secret:str='development-only-secret-change-before-public-deployment'
    reviewed_digest:str=''
    allowed_origins:tuple[str,...]=()
    engine_snapshot:Path|None=None
    engine_snapshot_digest:str=''
    engine_manifest_digest:str=''

    @classmethod
    def from_env(cls):
        root=Path(os.getenv('EF_ROOT',str(Path(__file__).resolve().parents[1]))).resolve()
        return cls(root=root,state_path=Path(os.getenv('EF_STATE_PATH',str(root/'runtime/state.sqlite3'))),
          production=os.getenv('EF_PRODUCTION','0')=='1',allow_paid=os.getenv('EF_ALLOW_PAID','0')=='1',
          api_key=os.getenv('GEMINI_API_KEY',''),monthly_cap=micro_usd(os.getenv('EF_MONTHLY_BUDGET_USD','0')),
          reservation=micro_usd(os.getenv('EF_REQUEST_RESERVATION_USD','0.02')),
          model=os.getenv('EF_MODEL','gemini-3.1-flash-lite'),
          input_rate=Decimal(os.getenv('EF_INPUT_USD_PER_MILLION','0.25')),
          output_rate=Decimal(os.getenv('EF_OUTPUT_USD_PER_MILLION','1.50')),
          state_secret=os.getenv('EF_STATE_SECRET','development-only-secret-change-before-public-deployment'),
          reviewed_digest=os.getenv('EF_REVIEWED_CONTENT_DIGEST',''),
          allowed_origins=tuple(x.strip() for x in os.getenv('EF_ALLOWED_ORIGINS','').split(',') if x.strip()),
          engine_snapshot=Path(os.environ['EF_ENGINE_SNAPSHOT']) if os.getenv('EF_ENGINE_SNAPSHOT') else None,
          engine_snapshot_digest=os.getenv('EF_ENGINE_SNAPSHOT_SHA256',''),
          engine_manifest_digest=os.getenv('EF_ENGINE_MANIFEST_SHA256',''))

    def validate(self,content_digest:str):
        import re
        if self.model!='gemini-3.1-flash-lite':
            raise ValueError('This adapter is priced and bounded for gemini-3.1-flash-lite only. Review rates/configuration before adding another model.')
        if self.reservation<=0:raise ValueError('Reservation must be positive')
        if not all(r.is_finite() and r>=0 for r in [self.input_rate,self.output_rate]):raise ValueError('Invalid model rates')
        # Conservative engineering guard, not an external-provider billing guarantee:
        # allow one token per UTF-8 byte plus a large protocol/schema margin.
        estimate=(Decimal(self.max_input_bytes+4096)*self.input_rate+Decimal(self.max_output_tokens)*self.output_rate)
        if self.reservation < int(estimate.to_integral_value(rounding=ROUND_CEILING)):
            raise ValueError('Per-call reservation is below the configured maximum-cost guard')
        if self.production:
            if len(self.state_secret)<32 or self.state_secret.startswith('development-'):raise ValueError('Set a unique EF_STATE_SECRET of at least 32 characters')
            if self.reviewed_digest!=content_digest:raise ValueError('Owner content review required: set EF_REVIEWED_CONTENT_DIGEST to the reviewed library digest')
            if '*' in self.allowed_origins:raise ValueError('Use explicit CORS origins in production')
        for origin in self.allowed_origins:
            if not re.fullmatch(r'https?://[^/\s]+',origin):raise ValueError('CORS origins must be exact HTTP(S) origins')

    @property
    def paid_enabled(self):
        return self.allow_paid and bool(self.api_key) and self.monthly_cap>0
