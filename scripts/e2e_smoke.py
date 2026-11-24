"""Browser smoke test: signs in as each role and walks the main screens and flows.

Needs a freshly seeded database, the backend on :8000 and the frontend on :5173, and Playwright:

    pip install playwright && playwright install chromium
    docker compose exec backend python -m app.seed --reset
    python scripts/e2e_smoke.py

It records a delivery and a payment and creates a cooperative, so reset the seed data before running it again.
Set BASE_URL to test another address. Exit code is 1 if any check fails.
"""
import os, re, sys, time
from playwright.sync_api import sync_playwright
BASE=os.environ.get("BASE_URL","http://localhost:5173")
results=[]; 
def ok(name, cond, extra=""):
    results.append((name, bool(cond), extra)); print(("PASS " if cond else "FAIL ")+name+(" :: "+str(extra) if extra and not cond else ""))

def new_ctx(b, w=1440, h=900):
    ctx=b.new_context(viewport={"width":w,"height":h}, reduced_motion="reduce")
    pg=ctx.new_page(); pg.problems=[]
    pg.on("pageerror", lambda e: pg.problems.append("JS "+str(e)))
    pg.on("console", lambda m: pg.problems.append("CONSOLE "+m.text) if m.type=="error" and "401" not in m.text else None)
    def resp(r):
        if r.status>=400 and not (r.url.endswith("/api/auth/me") and r.status==401) and "/api/" in r.url:
            pg.problems.append(f"HTTP {r.status} {r.request.method} {r.url.replace(BASE,'')}")
    pg.on("response", resp)
    return ctx,pg

def login(pg, user, pw="harvest2026"):
    pg.goto(BASE+"/login"); pg.get_by_label("Username or phone number").fill(user); pg.get_by_label("Password").fill(pw)
    pg.locator("button.submit").click(); pg.wait_for_url("**/dashboard", timeout=8000)

with sync_playwright() as p:
    b=p.chromium.launch()
    # ---------- Guest / landing ----------
    ctx,pg=new_ctx(b)
    pg.goto(BASE+"/"); pg.wait_for_timeout(1000)
    ok("landing loads headline", pg.locator("h1").inner_text().startswith("Know what every farmer"))
    facts=pg.locator(".lp-facts dt").all_inner_texts()
    ok("landing shows live numbers", facts[:2]==["1","10"] and facts[2].isdigit(), facts)
    for href in ["#try","#how-it-works","#roles"]:
        pg.click(f".lp-nav-links a[href='{href}']"); pg.wait_for_timeout(700)
        ok(f"nav anchor {href} scrolls", pg.evaluate(f"document.querySelector('{href}').getBoundingClientRect().top < 400"))
    pg.evaluate("window.scrollTo(0,0)")
    before=pg.eval_on_selector(".lp-page","e=>e.className")
    pg.click(".lp-nav .theme-toggle"); pg.wait_for_timeout(1300)
    after=pg.eval_on_selector(".lp-page","e=>e.className")
    ok("landing theme toggle flips", before!=after, (before,after))
    pg.click(".lp-nav .theme-toggle"); pg.wait_for_timeout(1300)
    ok("hero receipt card links to how it works", pg.get_attribute("a.lp-float","href")=="#how-it-works")
    # demo ledger
    pg.locator("#try").scroll_into_view_if_needed()
    pg.locator(".lp-sheet .lp-price input").fill("500"); pg.wait_for_timeout(200)
    ok("try-it ledger recalculates", "500" in pg.locator(".lp-sheet").inner_text() and "21,000" in pg.locator(".lp-sheet").inner_text())
    ok("landing no errors", not pg.problems, pg.problems)
    # login errors
    pg.goto(BASE+"/login"); pg.get_by_label("Username or phone number").fill("aline"); pg.get_by_label("Password").fill("wrongpass1"); pg.locator("button.submit").click(); pg.wait_for_timeout(800)
    ok("bad password shows error", pg.locator(".alert").count()>0)
    pg.problems.clear()
    ok("guest redirected from /dashboard", (pg.goto(BASE+"/dashboard") and pg.wait_for_timeout(600) is None and "/login" in pg.url) or "/login" in pg.url, pg.url)
    pg.goto(BASE+"/nonexistent"); pg.wait_for_timeout(1000); ok("404 page", pg.locator("text=Page not found").count()==1)
    # auth page theme
    pg.goto(BASE+"/login"); pg.click(".auth-theme"); pg.wait_for_timeout(1200)
    ok("auth theme toggle", "theme-dark" in pg.eval_on_selector(".shell","e=>e.className"))
    ctx.close()

    # ---------- Manager ----------
    ctx,pg=new_ctx(b); login(pg,"aline")
    ok("manager dashboard", pg.locator("text=Dashboard").count()>0)
    pg.locator("select.period-select").select_option("quarter") if pg.locator("select.period-select").count() else None
    for path in ["/dashboard","/farmers","/deliveries","/payments","/produce","/staff","/audit","/settings","/reports","/corrections"]:
        pg.problems.clear(); pg.goto(BASE+path); pg.wait_for_timeout(900)
        ok(f"manager {path} loads clean", not pg.problems and "/login" not in pg.url and pg.locator("text=Page not found").count()==0, pg.problems)
    pg.goto(BASE+"/deliveries/new"); pg.wait_for_timeout(500)
    ok("manager blocked from recording delivery", pg.locator("button:has-text('Record delivery')").count()==0)
    pg.goto(BASE+"/audit"); pg.wait_for_timeout(600); pg.click("button:has-text('Check integrity')"); pg.wait_for_timeout(1000)
    ok("audit integrity check passes", "Integrity check passed" in pg.inner_text("main"), pg.inner_text("main")[-200:])
    # dark mode in app
    pg.goto(BASE+"/dashboard"); pg.click(".app-top .theme-toggle"); pg.wait_for_timeout(1300)
    ok("app dark mode", "theme-dark" in pg.eval_on_selector(".app","e=>e.className"))
    pg.reload(); pg.wait_for_timeout(900); ok("app dark persists", "theme-dark" in pg.eval_on_selector(".app","e=>e.className"))
    # produce mix periods
    pg.goto(BASE+"/dashboard"); pg.wait_for_timeout(900)
    sel=pg.locator("select.period-select")
    if sel.count():
        for v in ["week","month","quarter"]:
            sel.first.select_option(v); pg.wait_for_timeout(500)
        ok("produce period dropdown works", not pg.problems, pg.problems)
    # reports print layout visible
    pg.goto(BASE+"/reports"); pg.wait_for_timeout(800)
    ok("reports page renders table or summary", pg.locator("main table, main .stat").count()>0)
    # staff page + audit page screens
    ctx.close()

    # ---------- Clerk ----------
    ctx,pg=new_ctx(b); login(pg,"patrick")
    pg.goto(BASE+"/deliveries/new"); pg.wait_for_timeout(800)
    pg.locator("#farmerId").select_option(index=1); pg.locator("#produceId").select_option(index=1)
    pg.wait_for_timeout(200)
    if pg.locator("#grade").count(): 
        opts=pg.locator("#grade option").count()
        if opts>1: pg.locator("#grade").select_option(index=1)
    pg.locator("#kg").fill("12.345"); pg.locator("button:has-text('Record delivery')").first.click(); pg.wait_for_timeout(1200)
    ok("clerk records a delivery", pg.locator("text=Delivery recorded").count()>0, pg.problems)
    link=pg.locator("a:has-text('receipt')")
    if link.count(): 
        link.first.click(); pg.wait_for_timeout(900); ok("receipt page opens", pg.locator(".receipt-head, .slip").count()>0, pg.problems)
    pg.goto(BASE+"/payments/new"); pg.wait_for_timeout(500)
    ok("clerk cannot record payments", pg.locator("button:has-text('Review and record payment')").count()==0)
    pg.problems.clear()
    for path in ["/farmers","/deliveries","/payments","/produce","/corrections","/farmers/new"]:
        pg.goto(BASE+path); pg.wait_for_timeout(700)
        ok(f"clerk {path} loads clean", not pg.problems, pg.problems); pg.problems.clear()
    pg.goto(BASE+"/audit"); pg.wait_for_timeout(500); ok("clerk blocked from audit", pg.locator("button:has-text('Check integrity')").count()==0)
    ctx.close()

    # ---------- Payment officer ----------
    ctx,pg=new_ctx(b); login(pg,"claudine")
    pg.goto(BASE+"/payments/new"); pg.wait_for_timeout(800)
    n_owed=pg.locator("#farmerId option").count()-1
    pg.goto(BASE+"/farmers"); pg.wait_for_timeout(800)
    ok("payment dropdown lists only farmers who are owed", 0<n_owed<10, n_owed)
    pg.goto(BASE+"/payments/new"); pg.wait_for_timeout(500)
    pg.locator("#farmerId").select_option(index=1)
    ok("choosing a farmer prefills the full balance", pg.locator("#amount").input_value()!="")
    pg.locator("button:has-text('Review and record payment')").click(); pg.wait_for_timeout(500)
    pg.locator("button:has-text('Confirm and record')").click(); pg.wait_for_timeout(1200)
    ok("officer records full payment", pg.locator("text=Payment recorded").count()>0, pg.problems)
    pg.goto(BASE+"/payments/new"); pg.wait_for_timeout(600)
    ok("paid farmer leaves the list", pg.locator("#farmerId option").count()-1==n_owed-1, (n_owed, pg.locator('#farmerId option').count()-1))
    pg.problems.clear()
    for path in ["/dashboard","/reports","/farmers","/deliveries","/payments"]:
        pg.goto(BASE+path); pg.wait_for_timeout(700); ok(f"officer {path} loads clean", not pg.problems, pg.problems); pg.problems.clear()
    pg.goto(BASE+"/deliveries/new"); pg.wait_for_timeout(500); ok("officer cannot record deliveries", pg.locator("button:has-text('Record delivery')").count()==0)
    ctx.close()

    # ---------- Signup flows ----------
    stamp=str(int(time.time()))[-6:]; coop=f"E2E Coop {stamp}"
    def signup(pg, typ, name, user, phone, coopname):
        pg.goto(BASE+"/signup"); pg.locator("#type").select_option(typ)
        pg.get_by_label("Your full name").fill(name); pg.get_by_label("Username (optional)").fill(user)
        pg.locator("#phone").fill(phone); pg.get_by_label("Cooperative name").fill(coopname)
        pg.locator("#password").fill("harvest2026"); pg.locator("#confirm").fill("harvest2026")
        pg.locator("button.submit").click(); pg.wait_for_timeout(1500)
    ctx,pg=new_ctx(b)
    signup(pg,"manager","Mary Manager",f"mary{stamp}",f"78{stamp}1",coop)
    ok("manager signup creates cooperative", pg.locator("text=Account created").count()>0, (pg.url, pg.problems))
    ctx.close()
    ctx,pg=new_ctx(b)
    signup(pg,"manager","Dup Manager",f"dup{stamp}",f"78{stamp}2",coop)
    ok("duplicate cooperative name rejected", "/signup" in pg.url and pg.locator(".error:visible, .alert").count()>0, pg.url)
    signup(pg,"clerk","Carl Clerk",f"carl{stamp}",f"78{stamp}3","Nonexistent Coop Zzz")
    ok("joining unknown cooperative rejected", "/signup" in pg.url and pg.locator(".error:visible, .alert").count()>0)
    signup(pg,"clerk","Carl Clerk",f"carl{stamp}",f"78{stamp}3",coop)
    ok("clerk join request submitted (pending)", pg.locator("text=Manager").count()>0 and "/dashboard" not in pg.url, pg.url)
    pg.goto(BASE+"/login"); pg.get_by_label("Username or phone number").fill(f"carl{stamp}"); pg.get_by_label("Password").fill("harvest2026"); pg.locator("button.submit").click(); pg.wait_for_timeout(900)
    ok("pending clerk cannot sign in", "/dashboard" not in pg.url and pg.locator(".alert").count()>0, pg.url)
    ctx.close()
    ctx,pg=new_ctx(b); login(pg,f"mary{stamp}")
    pg.goto(BASE+"/staff"); pg.wait_for_timeout(900)
    ok("manager sees request with role", "Carl Clerk" in pg.inner_text("main") and "Collection Clerk" in pg.inner_text("main"), pg.inner_text("main")[:300])
    pg.locator("button:has-text('Approve')").first.click(); pg.wait_for_timeout(600)
    dlg=pg.locator("dialog[open] button:has-text('Approve'), [role=dialog] button:has-text('Approve')")
    if dlg.count(): dlg.last.click(); pg.wait_for_timeout(900)
    ctx.close()
    ctx,pg=new_ctx(b); 
    try: login(pg,f"carl{stamp}"); ok("approved clerk can sign in", True)
    except Exception as e: ok("approved clerk can sign in", False, str(e)[:120])
    ctx.close()

    # ---------- Phone width ----------
    ctx,pg=new_ctx(b,390,844)
    pg.goto(BASE+"/"); pg.wait_for_timeout(900)
    ok("phone landing no horizontal scroll", pg.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"), pg.evaluate("document.documentElement.scrollWidth"))
    login(pg,"aline"); pg.goto(BASE+"/dashboard"); pg.wait_for_timeout(800)
    ok("phone dashboard no horizontal scroll", pg.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"), pg.evaluate("document.documentElement.scrollWidth"))
    ok("phone no errors", not pg.problems, pg.problems)
    ctx.close(); b.close()
fails=[r for r in results if not r[1]]
print(f"\n{len(results)-len(fails)}/{len(results)} passed"); 
for f in fails: print("FAILED:",f)
sys.exit(1 if fails else 0)
