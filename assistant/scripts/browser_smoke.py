"""Offline DOM/interaction smoke check. Does not test deployed browser networking or CSP."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import json,sys,tempfile
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from fastapi.testclient import TestClient
from emissionflow.app import create_app
from emissionflow.settings import Settings
root=ROOT;out=Path(tempfile.mkdtemp(prefix='emissionflow-browser-'))
print('Browser test output:',out)
client=TestClient(create_app(Settings(root=root,state_path=Path(tempfile.mkdtemp())/'state.db',minute_rate_limit=500)))
def api(source,args):
 response=client.request(args.get('method','GET'),args['path'],content=args.get('body'),headers={'Content-Type':'application/json'})
 return {'status':response.status_code,'json':response.json()}
html=(root/'web/index.html').read_text().replace('<link rel="stylesheet" href="/static/style.css">','').replace('<script src="/static/app.js" defer></script>','')
script=(root/'web/app.js').read_text()
css=(root/'web/style.css').read_text()
shim="""window.fetch=async(path,opts={})=>{const r=await window.__api({path:String(path),method:opts.method||'GET',body:opts.body});return new Response(JSON.stringify(r.json),{status:r.status,headers:{'Content-Type':'application/json'}});};"""
errors=[];results={'harness':'offline DOM; browser fetch bridged to FastAPI TestClient; network/CSP not exercised'}
with sync_playwright() as p:
 import os,shutil
 executable=os.getenv('CHROMIUM_PATH') or shutil.which('chromium')
 browser=p.chromium.launch(**({'executable_path':executable} if executable else {}),headless=True,args=['--no-sandbox'])
 def page_with(size):
  page=browser.new_page(viewport=size,device_scale_factor=1)
  page.on('pageerror',lambda e:errors.append(str(e)));page.expose_binding('__api',api)
  page.set_content(html);page.add_style_tag(content=css);page.add_script_tag(content=shim);page.add_script_tag(content=script)
  page.wait_for_function("document.querySelector('#status').textContent.includes('rc54')")
  return page
 page=page_with({'width':1440,'height':1000})
 page.screenshot(path=str(out/'desktop-home.png'),full_page=True)
 page.locator('#question').fill('What is Monte Carlo?');page.locator('#send').click()
 page.wait_for_selector('article h3');assert 'Monte Carlo' in page.locator('article h3').last.inner_text()
 assert 'No model call' in page.locator('.tools').last.inner_text()
 page.locator('.details-link').last.click();page.wait_for_function("document.querySelector('#conversation').textContent.includes('not repeated observations')")
 page.screenshot(path=str(out/'desktop-monte-carlo.png'),full_page=True);results['monte_carlo_with_sources']=True
 page.locator('#reset').click();page.locator('#metric').select_option('CH4')
 page.locator('#question').fill('What is this gas?');page.locator('#send').click();page.wait_for_selector('article h3')
 assert 'Methane' in page.locator('article h3').last.inner_text();results['selected_gas']=True
 page.locator('#reset').click();page.locator('#question').fill('Is ammonia included?');page.locator('#send').click()
 page.wait_for_function("document.querySelector('#conversation').textContent.includes('Documentation conflict')");results['source_conflict_visible']=True
 page.locator('#show-library').click();assert page.locator('#library-dialog').is_visible();page.locator('#close-dialog').click();results['library_dialog']=True
 results['desktop_horizontal_overflow']=page.evaluate('document.documentElement.scrollWidth > window.innerWidth')
 mobile=page_with({'width':390,'height':844});mobile.screenshot(path=str(out/'mobile-home.png'),full_page=True)
 results['mobile_horizontal_overflow']=mobile.evaluate('document.documentElement.scrollWidth > window.innerWidth')
 results['javascript_errors']=errors;browser.close()
(out/'browser_results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results,indent=2))
