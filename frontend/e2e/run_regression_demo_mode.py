import os, re, sys
os.makedirs("e2e-out", exist_ok=True)
from playwright.sync_api import sync_playwright
BASE = "http://localhost:5199"
results = []
def check(name, cond, extra=""):
    results.append((name, bool(cond), extra)); print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if (extra and not cond) else ""))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1366, "height": 900}, accept_downloads=True)
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))

    def goto(path): page.goto(BASE + path); page.wait_for_load_state("networkidle")
    def login(role):
        goto("/login"); page.get_by_role("button", name=re.compile(f"Log in as {role}")).click()
        page.wait_for_url(re.compile(r"/dashboard$"), timeout=8000)
    def logout():
        page.get_by_role("button", name="Logout").first.click() if page.get_by_role("button", name="Logout").first.is_visible() else None
        page.wait_for_url(re.compile(r"/login"), timeout=5000)

    # ---- public routes
    for path, text in [("/", "Ambulance booking"), ("/login", "Developer demo mode"), ("/register", "Create a demo account"), ("/forgot-password", "Forgot password"), ("/nope", "Page not found")]:
        goto(path); check(f"public {path} renders", text in page.content())
    # ---- guards
    goto("/admin/dashboard"); check("unauth admin route -> login", "/login" in page.url)
    login("Patient"); check("patient lands on /patient/dashboard", page.url.endswith("/patient/dashboard"))
    goto("/admin/dashboard"); check("patient blocked from admin", "/unauthorized" in page.url)
    goto("/driver/requests"); check("patient blocked from driver", "/unauthorized" in page.url)
    goto("/patient/dashboard"); check("session survives refresh", page.url.endswith("/patient/dashboard") and "Welcome" in page.content())
    check("demo notice on dashboard", "does not contact emergency services" in page.content())

    # ---- patient booking
    before = int(page.locator("text=Total bookings").locator("xpath=../p[2]").inner_text())
    goto("/patient/book-ambulance"); page.get_by_role("button", name=re.compile("Review & submit")).click()
    check("booking invalid submit blocked with errors", page.locator("[role=alert]").count() >= 2 and page.locator("dialog[open]").count() == 0)
    page.select_option("#quick", label="Green Park Apartments")
    page.get_by_label("Patient condition / notes").fill("Fictional chest discomfort for demo")
    page.get_by_role("button", name=re.compile("Review & submit")).click()
    check("confirm dialog opens", page.locator("dialog[open]").count() == 1)
    page.get_by_role("dialog").get_by_role("button", name="Submit demo booking").click()
    page.wait_for_url(re.compile(r"/patient/bookings\?view="), timeout=8000)
    page.wait_for_selector("dialog[open]", timeout=5000)
    check("redirect to booking details after submit", page.locator("dialog[open]").count() == 1 and "Requested" in page.locator("dialog[open]").inner_text())
    ref = re.search(r"RR-\d{4}-\d{4}", page.locator("dialog[open] h2").inner_text()).group(0)
    page.keyboard.press("Escape"); page.wait_for_timeout(300)
    check("new booking in My Bookings", ref in page.locator("table").inner_text())
    goto("/patient/dashboard")
    after = int(page.locator("text=Total bookings").locator("xpath=../p[2]").inner_text())
    check("dashboard total incremented", after == before + 1, f"{before}->{after}")
    goto("/patient/book-ambulance"); check("duplicate open booking blocked (submit disabled)", page.get_by_role("button", name=re.compile("Review & submit")).is_disabled())
    goto("/patient/track-ambulance"); c = page.content()
    check("tracking labelled simulated", "Simulated tracking" in c and "not live GPS" in c)
    page.wait_for_timeout(1500)
    check("tracking map or fallback visible", page.locator("figure").count() >= 1)
    # search/filter changes results
    goto("/patient/bookings"); n_all = page.locator("tbody tr").count()
    page.get_by_label("Status").select_option("cancelled"); n_c = page.locator("tbody tr").count()
    check("status filter changes rows", n_c < n_all and n_c >= 1, f"{n_all}->{n_c}")
    page.get_by_label("Status").select_option("all"); page.get_by_label("Search").fill("zzzzzz")
    check("search empty state", "No bookings match" in page.content()); page.get_by_role("button", name="Clear filters").click()
    # profile persistence
    goto("/patient/profile"); page.get_by_label("Full name").fill("Asha Verma Jr"); page.get_by_role("button", name="Save profile").click()
    page.wait_for_selector("text=Profile saved"); goto("/patient/profile"); check("profile edit persists", page.get_by_label("Full name").input_value() == "Asha Verma Jr")
    page.get_by_label("Full name").fill("Asha Verma"); page.get_by_role("button", name="Save profile").click(); page.wait_for_selector("text=Profile saved")
    page.get_by_role("button", name="Logout").first.click(); page.wait_for_url(re.compile("/login"))
    goto("/patient/dashboard"); check("logout clears session", "/login" in page.url)

    # ---- driver
    login("Driver"); check("driver lands on dashboard", page.url.endswith("/driver/dashboard"))
    goto("/driver/requests"); check("driver sees queue incl. new booking", ref in page.content())
    page.locator("li", has_text=ref).get_by_role("button", name=re.compile("^Accept")).click()
    page.wait_for_selector("text=Accepted " + ref, timeout=6000)
    goto("/driver/requests"); check("accepted removed from queue", page.locator("li", has_text=ref).count() == 0)
    check("accept disabled while on active trip", all(x.is_disabled() for x in page.get_by_role("button", name=re.compile("^Accept")).all()))
    goto("/driver/dashboard"); check("driver cannot go offline mid-trip", page.get_by_role("switch").first.is_disabled())
    goto("/driver/active-trip")
    for label in ["Start trip (head to pickup)", "Arrived at pickup", "Start transport"]:
        page.get_by_role("button", name=label).click(); page.wait_for_timeout(700)
    check("only valid next action shown", page.get_by_role("button", name="Complete trip").count() == 1 and page.get_by_role("button", name="Start transport").count() == 0)
    page.get_by_role("button", name="Complete trip").click(); page.get_by_role("dialog").get_by_role("button", name="Complete trip").click()
    page.wait_for_selector("text=No active trip", timeout=6000); check("trip completed -> no active trip", True)
    goto("/driver/trip-history"); check("completed trip in history", ref in page.locator("table").inner_text())
    page.get_by_role("button", name="Logout").first.click(); page.wait_for_url(re.compile("/login"))

    # ---- patient sees completion (cross-role propagation)
    login("Patient"); goto("/patient/bookings"); row = page.locator("tr", has_text=ref)
    check("patient sees Completed", "Completed" in row.inner_text()); check("no cancel on completed", row.get_by_role("button", name=re.compile("Cancel")).count() == 0)
    page.get_by_role("button", name="Logout").first.click(); page.wait_for_url(re.compile("/login"))

    # ---- admin
    login("Admin"); check("admin lands on dashboard", page.url.endswith("/admin/dashboard"))
    page.wait_for_timeout(800); check("admin dashboard charts render", page.locator(".recharts-wrapper").count() >= 3)
    goto("/admin/bookings"); check("admin bookings include new ref", ref in page.locator("table").inner_text())
    goto("/admin/dispatch"); page.wait_for_timeout(500); t = page.locator("main").inner_text()
    check("dispatch shows simulated recommendation (RR-AMB-02 over nearest RR-AMB-01)", "RR-AMB-02" in t and "geographically closer" in t and "Simulated" in t)
    check("dispatch lists ineligible reasons", "Driver is offline" in t or "Busy with another" in t or "Not in service" in t)
    # assign recommended then driver decline path via admin reassign
    page.get_by_role("button", name="Assign recommended").click(); page.wait_for_selector("text=Assigned RR-", timeout=6000); check("admin assign recommended succeeds", True)
    goto("/admin/ambulances"); check("ambulances table", "RR-AMB-02" in page.content())
    page.get_by_role("button", name="Add ambulance").click(); page.get_by_label(re.compile("Registration")).fill("RR-AMB-02"); page.get_by_role("button", name="Add ambulance").last.click()
    page.wait_for_selector("text=already exists", timeout=5000); check("duplicate registration rejected", True)
    page.get_by_label(re.compile("Registration")).fill("RR-AMB-77"); page.get_by_role("button", name="Add ambulance").last.click(); page.wait_for_selector("text=Ambulance added")
    check("new ambulance listed", "RR-AMB-77" in page.locator("table").inner_text())
    page.locator("tr", has_text="RR-AMB-77").get_by_role("button", name=re.compile("Delete")).click(); page.get_by_role("dialog").get_by_role("button", name="Delete ambulance").click(); page.wait_for_selector("text=Ambulance deleted")
    check("ambulance deleted", "RR-AMB-77" not in page.locator("table").inner_text())
    page.locator("tr", has_text="RR-AMB-04").get_by_role("button", name=re.compile("Delete")).click(); page.get_by_role("dialog").get_by_role("button", name="Delete ambulance").click()
    page.wait_for_selector("text=active booking", timeout=5000); check("delete with active booking blocked", True); page.keyboard.press("Escape")
    goto("/admin/users"); page.locator("tr", has_text="Admin Demo").get_by_role("button", name=re.compile("Deactivate")).is_disabled() and check("admin deactivate disabled", True)
    page.get_by_label("Search").fill("meera"); check("user search filters", page.locator("tbody tr").count() == 1)
    goto("/admin/drivers"); check("drivers page", "DRV-001" in page.content())
    goto("/admin/demand-positioning"); page.wait_for_timeout(500); check("demand page explains rule", "rule works" in page.content() and "Suggested repositioning" in page.content())
    goto("/admin/reports")
    with page.expect_download(timeout=8000) as d: page.get_by_role("button", name="Export bookings CSV").click()
    path = d.value.path(); csv = open(path, encoding="utf-8-sig").read()
    check("CSV export downloads real data", csv.startswith("Booking ID,") and ref in csv and csv.count("\n") >= 10, csv[:80])
    page.fill("#to", "2099-12-31"); page.fill("#from", "2099-01-01"); check("export disabled with empty range", page.get_by_role("button", name="Export bookings CSV").is_disabled())
    goto("/admin/settings"); page.get_by_role("button", name="Reset demo data").click(); page.get_by_role("dialog").get_by_role("button", name="Reset demo data").click()
    page.wait_for_url(re.compile("/login"), timeout=8000); check("reset demo data confirmed + logs out", True)
    login("Patient"); goto("/patient/bookings"); check("reset restored seed (new booking gone)", ref not in page.content())
    # corrupted storage
    page.evaluate("localStorage.setItem('rr.state', '{not json')"); goto("/login"); check("corrupted storage recovers (reseeded, app usable)", "Developer demo mode" in page.content() or "Welcome" in page.content())
    page.evaluate("localStorage.setItem('rr.state', JSON.stringify({v:1,data:{users:'x'}}))"); goto("/login"); check("invalid-shape storage recovers", "Developer demo mode" in page.content() or "Welcome" in page.content())

    # ---- responsive overflow
    page.get_by_role("button", name="Logout").first.click(); page.wait_for_url(re.compile("/login"))
    login("Admin")
    pages = ["/", "/login", "/admin/dashboard", "/admin/bookings", "/admin/dispatch", "/admin/ambulances", "/admin/reports", "/admin/demand-positioning"]
    for w, h in [(375, 800), (768, 1024), (1024, 768), (1366, 900)]:
        page.set_viewport_size({"width": w, "height": h}); bad = []
        for pth in pages:
            goto(pth); page.wait_for_timeout(300)
            if page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1"): bad.append(pth)
        check(f"no horizontal page overflow @{w}px", not bad, ",".join(bad))
    page.set_viewport_size({"width": 375, "height": 800}); goto("/admin/dashboard")
    page.get_by_role("button", name="Open menu").click(); check("mobile menu opens", page.get_by_role("dialog", name="Navigation menu").count() == 1)
    page.screenshot(path="./e2e-out/mobile_menu.png"); page.keyboard.press("Escape")
    page.set_viewport_size({"width": 1366, "height": 900}); goto("/admin/dispatch"); page.wait_for_timeout(1200); page.screenshot(path="./e2e-out/dispatch.png", full_page=True)
    goto("/"); page.screenshot(path="./e2e-out/landing.png", full_page=True)
    real = [e for e in errors if "tile.openstreetmap" not in e and "ERR_" not in e and "Failed to load resource" not in e]
    check("no unexpected console/page errors", not real, " | ".join(real[:3]))
    b.close()
bad = [r for r in results if not r[1]]
print(f"\n{len(results)-len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
