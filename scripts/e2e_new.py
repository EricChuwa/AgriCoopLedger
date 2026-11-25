import sys
sys.path.insert(0, "/tmp")
import importlib.util, re
from playwright.sync_api import sync_playwright
BASE="http://localhost:5173"
results=[]
def ok(name, cond, extra=""):
    results.append(bool(cond)); print(("PASS " if cond else "FAIL ")+name+(" :: "+str(extra) if extra and not cond else ""))
def new_ctx(b):
    ctx=b.new_context(viewport={"width":1440,"height":900}, reduced_motion="reduce"); pg=ctx.new_page(); pg.problems=[]
    pg.on("pageerror", lambda e: pg.problems.append("JS "+str(e)))
    return ctx,pg
def login(pg,u):
    pg.goto(BASE+"/login"); pg.get_by_label("Username or phone number").fill(u); pg.get_by_label("Password").fill("harvest2026")
    pg.locator("button.submit").click(); pg.wait_for_url("**/dashboard", timeout=8000)

with sync_playwright() as p:
    b=p.chromium.launch()
    # Clerk proposes
    cc,cl=new_ctx(b); login(cl,"patrick")
    cl.goto(BASE+"/farmers"); cl.wait_for_timeout(600)
    cl.get_by_role("button",name="Propose farmer").first.click(); cl.wait_for_timeout(400)
    ok("clerk sees Propose farmer pop up", cl.locator("dialog[open]").count()==1 and "Propose a farmer" in cl.locator("dialog").inner_text())
    cl.get_by_label("Full name").fill("Test Proposed Farmer"); cl.get_by_label("National ID").fill("1199070055501234")
    cl.locator("dialog button[type=submit]").click(); cl.wait_for_timeout(1500)
    ok("clerk proposal closes pop up and shows the farmer waiting", cl.locator("dialog[open]").count()==0 and "Test Proposed Farmer" in cl.locator("table").inner_text() and "sent to a Manager" in cl.locator(".notice").inner_text())
    # Manager approves
    mc,mg=new_ctx(b); login(mg,"aline")
    mg.goto(BASE+"/farmers"); mg.wait_for_timeout(800)
    ok("manager sees Waiting filter count", "Waiting (1)" in mg.locator(".seg").inner_text(), mg.locator(".seg").inner_text())
    mg.get_by_role("button",name="Waiting").click(); mg.wait_for_timeout(300)
    mg.get_by_role("button",name=re.compile("Approve")).first.click(); mg.wait_for_timeout(300)
    mg.get_by_role("button",name="Approve",exact=True).click(); mg.wait_for_timeout(1200)
    ok("approved farmer leaves Waiting", "Test Proposed Farmer" not in mg.locator("table, .empty-block").inner_text())
    # Payment officer batch
    pc,po=new_ctx(b); login(po,"claudine")
    po.goto(BASE+"/batches/new"); po.wait_for_timeout(800)
    boxes=po.locator("tbody input[type=checkbox]")
    ok("batch page lists farmers owed", boxes.count()>=2, boxes.count())
    boxes.nth(0).check(); boxes.nth(1).check()
    po.get_by_role("button",name="Send to Manager for approval").click(); po.wait_for_url(re.compile(r"/batches/\d+"), timeout=8000)
    ok("batch created, waiting", "Waiting for a Manager" in po.locator("h1").inner_text())
    ok("no Pay button before approval", po.get_by_role("button",name=re.compile("^Pay")).count()==0)
    url=po.url
    mg.goto(url); mg.wait_for_timeout(800)
    mg.get_by_role("button",name=re.compile("^Approve")).first.click(); mg.wait_for_timeout(300)
    mg.get_by_role("button",name="Approve",exact=True).click(); mg.wait_for_timeout(1200)
    ok("manager approved batch", "Approved" in mg.locator("h1").inner_text(), mg.locator("h1").inner_text())
    po.reload(); po.wait_for_timeout(800)
    po.get_by_role("button",name=re.compile("^Pay")).first.click(); po.wait_for_timeout(300)
    po.get_by_role("button",name="Confirm and record").click(); po.wait_for_timeout(1500)
    ok("batch part paid", "Part paid" in po.locator("h1").inner_text(), po.locator("h1").inner_text())
    po.get_by_role("button",name=re.compile("^Pay")).first.click(); po.wait_for_timeout(300)
    po.get_by_role("button",name="Confirm and record").click(); po.wait_for_timeout(1500)
    ok("batch paid", po.locator("h1").inner_text().strip().endswith("Paid"), po.locator("h1").inner_text())
    ok("no JS errors", not (cl.problems+mg.problems+po.problems), cl.problems+mg.problems+po.problems)

    # Offline queue
    cc2,c2=new_ctx(b); login(c2,"patrick")
    c2.goto(BASE+"/deliveries/new"); c2.wait_for_timeout(800)
    c2.locator("dialog #farmerId").select_option(index=1); c2.locator("dialog #produceId").select_option(index=1)
    cc2.set_offline(True); c2.wait_for_timeout(300)
    c2.locator("dialog #kg").fill("12")
    c2.locator("dialog button[type=submit]").click(); c2.wait_for_timeout(800)
    body=c2.locator("dialog").inner_text()
    ok("offline: saved on device message", re.search("on this device|offline|saved on|Waiting to send",body,re.I), body[:400])
    cc2.set_offline(False); c2.wait_for_timeout(500)
    c2.evaluate("window.dispatchEvent(new Event('online'))"); c2.wait_for_timeout(4000)
    c2.goto(BASE+"/deliveries"); c2.wait_for_timeout(1200)
    mine=c2.locator("tbody tr").filter(has_text="12").count()
    ok("offline: delivery synced to server", mine>=1, mine)
    b.close()
print(sum(results),"/",len(results))
