"""Run against a built library: python tests/browser.py. Requires Playwright + Chromium.
Speech-controller tests use a fake device engine; they do NOT verify audible voices.
"""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.getenv('TEST_BASE_URL','http://127.0.0.1:3000')
OUT=Path('test-results'); OUT.mkdir(exist_ok=True)
SPEECH_MOCK="""(() => {
  window.__spoken=[]; window.__utterance=null;
  class Utterance { constructor(text){this.text=text;} }
  Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Utterance,configurable:true});
  Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{name:'Test English',lang:'en-US',voiceURI:'test',localService:true,default:true}],addEventListener:()=>{},resume:()=>{},cancel:()=>{window.__utterance=null;},speak:u=>{window.__utterance=u;window.__spoken.push(u.text);setTimeout(()=>{if(window.__utterance===u)u.onstart?.();},0);}},configurable:true});
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async t=>{window.__copied=t;}},configurable:true});
})();"""
with sync_playwright() as p:
    executable=os.getenv('CHROMIUM_PATH')
    browser=p.chromium.launch(headless=True,**({'executable_path':executable} if executable else {}),args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1050})
    context.add_init_script(SPEECH_MOCK)
    page=context.new_page(); errors=[]; console=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('console',lambda msg:console.append(f'{msg.type}: {msg.text}'))
    page.goto(BASE); page.locator('[data-work]').first.wait_for()
    assert page.locator('[data-work]').count()==5
    page.screenshot(path=str(OUT/'desktop-library.png'),full_page=True)
    for work in ['bible-asv','tanakh-jps','quran-pickthall','gita-arnold','dhammapada-muller']:
        page.locator(f'[data-work="{work}"]').click()
        try:
            page.locator('.verse').first.wait_for(state='attached',timeout=15000)
        except Exception:
            print('FAILED WORK:',work,flush=True)
            print('PAGE ERRORS:',errors,flush=True)
            print('CONSOLE:',console[-30:],flush=True)
            print('READING CONTENT:',page.locator('#reading-content').text_content(),flush=True)
            print('READER MESSAGE:',page.locator('#reader-message').text_content(),flush=True)
            print('READER OPEN:',page.locator('#reader').get_attribute('open'),flush=True)
            page.screenshot(path=str(OUT/f'debug-{work}.png'))
            raise
        assert len(page.locator('.verse').first.text_content() or '')>20
        page.locator('#close-reader').click()
    page.locator('[data-work="bible-asv"]').click();page.locator('.verse').first.wait_for(state='attached',timeout=15000)
    page.locator('#chapter-select').select_option('2');page.locator('.verse').first.wait_for(state='attached',timeout=15000)
    page.locator('#verse-select').select_option('8')
    assert page.locator('#verse-select').input_value()=='8'
    page.reload();page.locator('#continue-reading').wait_for();assert page.locator('#header-continue').is_visible();page.locator('#continue-reading').click();page.locator('.verse').first.wait_for(state='attached',timeout=15000)
    assert page.locator('#chapter-select').input_value()=='2'
    assert page.locator('#verse-select').input_value()=='8'
    page.locator('#read-aloud').click();page.get_by_role('button',name='Pause',exact=True).wait_for()
    assert len(page.evaluate('window.__spoken'))==1
    page.locator('#read-aloud').click();assert page.locator('#read-aloud').inner_text()=='Resume'
    page.locator('#read-aloud').click();page.get_by_role('button',name='Pause',exact=True).wait_for()
    # Simulate end-of-utterance to exercise sequencing, not audio quality.
    page.evaluate('window.__utterance.onend()');page.wait_for_timeout(80)
    assert len(page.evaluate('window.__spoken'))>=3
    page.locator('#stop-audio').click();assert page.locator('#read-aloud').inner_text()=='Read aloud'
    assert 'Genesis 2' in page.locator('#reader-place').inner_text()
    assert page.locator('#reader-progress-bar').evaluate('(e)=>parseFloat(e.style.width)')>0
    assert page.evaluate('document.querySelector("#reading-content").getBoundingClientRect().width < document.querySelector("#reader").getBoundingClientRect().width')
    page.screenshot(path=str(OUT/'desktop-reader.png'))
    page.locator('#reader-settings').click();assert page.locator('#test-voice').is_visible();page.locator('#copy-progress-link').click();page.wait_for_timeout(50);copied=page.evaluate('window.__copied');assert '#restore=' in copied;page.locator('#theme').select_option('night')
    page.locator('#font-size').fill('29');page.locator('#font-size').dispatch_event('input')
    page.get_by_role('button',name='Close settings',exact=True).click()
    assert page.locator('html').get_attribute('data-theme')=='night'
    page.locator('#close-reader').click()
    # Complete-library boundary: final chapter and passage have no next page.
    page.locator('[data-work="dhammapada-muller"]').click();page.locator('.verse').first.wait_for(state='attached',timeout=15000)
    page.locator('#chapter-select').select_option('26');page.locator('.verse').first.wait_for(state='attached',timeout=15000)
    page.locator('#verse-select').select_option('423');assert page.locator('#next-page').is_disabled()
    page.keyboard.press('Escape');assert not page.locator('#reader').is_visible()
    assert not errors,errors
    context.close()
    mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    mobile.add_init_script(SPEECH_MOCK); page=mobile.new_page();page.on('dialog',lambda dialog:dialog.accept());page.goto(copied);page.locator('#mobile-continue').wait_for();page.locator('[data-work]').first.wait_for()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(OUT/'mobile-library.png'),full_page=True)
    page.locator('[data-work="quran-pickthall"]').click();page.locator('.verse').first.wait_for(state='attached',timeout=15000)
    page.screenshot(path=str(OUT/'mobile-reader.png'))
    assert page.evaluate('document.querySelector("#reader").getBoundingClientRect().width <= innerWidth')
    assert page.locator('#read-aloud').is_visible() and page.locator('#next-page').is_visible()
    assert page.evaluate('document.querySelector("#reading-content").getBoundingClientRect().right <= innerWidth')
    assert page.evaluate('document.querySelector("#reading-content").getBoundingClientRect().left >= 0')
    mobile.close();browser.close()
print('Browser checks passed: five editions, resume, audio controller, boundaries, desktop and mobile. Audible device output not tested.')
