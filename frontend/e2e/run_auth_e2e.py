import base64, json, re, sys, time, urllib.parse
from playwright.sync_api import sync_playwright

CONF = "http://localhost:4176"      # build WITH (fake) Firebase env
NOENV = "http://localhost:4175"     # build WITHOUT Firebase env
results = []
def check(name, cond, extra=""):
    results.append((name, bool(cond))); print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if (extra and not cond) else ""))

def b64(d): return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
class Backend:
    """Minimal stand-in for Firebase Identity Toolkit REST. Real Firebase JS SDK talks to this."""
    def __init__(self):
        self.users = {}; self.calls = []; self.oob = []; self.fail_verify = False; self.net_fail_oob = False; self.hold = False; self.held = []; self.hosts = set(); self.unhandled = []
    def token(self, email):
        u = self.users[email]; now = int(time.time())
        return f"{b64({'alg':'none','typ':'JWT'})}.{b64({'iss':'https://securetoken.google.com/test-project','aud':'test-project','user_id':u['localId'],'sub':u['localId'],'iat':now,'exp':now+3600,'email':email,'email_verified':u['emailVerified'],'firebase':{'identities':{'email':[email]},'sign_in_provider':'password'}})}.sig"
    def email_from(self, tok): return json.loads(base64.urlsafe_b64decode(tok.split(".")[1] + "==")) ["email"]
    def session(self, email): return {"kind": "identitytoolkit#x", "localId": self.users[email]["localId"], "email": email, "displayName": self.users[email].get("displayName", ""), "idToken": self.token(email), "refreshToken": "rt:" + email, "expiresIn": "3600", "registered": True}
    def err(self, msg): return 400, {"error": {"code": 400, "message": msg}}
    def handle(self, url, body):
        path = urllib.parse.urlparse(url).path; self.calls.append(path.split("/")[-1])
        if path.endswith("accounts:signUp"):
            e = body["email"].lower()
            if e in self.users: return self.err("EMAIL_EXISTS")
            if len(body["password"]) < 6: return self.err("WEAK_PASSWORD : Password should be at least 6 characters")
            self.users[e] = {"localId": "uid-" + str(len(self.users) + 1), "password": body["password"], "emailVerified": False}
            return 200, self.session(e)
        if path.endswith("accounts:signInWithPassword"):
            e = body["email"].lower(); u = self.users.get(e)
            if not u or u["password"] != body["password"]: return self.err("INVALID_LOGIN_CREDENTIALS")
            return 200, self.session(e)
        if path.endswith("accounts:update"):
            e = self.email_from(body["idToken"])
            if "displayName" in body: self.users[e]["displayName"] = body["displayName"]
            return 200, self.session(e)
        if path.endswith("accounts:sendOobCode"):
            if self.net_fail_oob: return "abort", None
            if body["requestType"] == "VERIFY_EMAIL":
                if self.fail_verify: return self.err("TOO_MANY_ATTEMPTS_TRY_LATER")
                self.oob.append(("verify", self.email_from(body["idToken"]))); return 200, {"email": self.email_from(body["idToken"])}
            if body["email"].lower() not in self.users: return self.err("EMAIL_NOT_FOUND")
            self.oob.append(("reset", body["email"].lower())); return 200, {"email": body["email"]}
        if path.endswith("accounts:lookup"):
            e = self.email_from(body["idToken"]); u = self.users[e]
            return 200, {"users": [{"localId": u["localId"], "email": e, "emailVerified": u["emailVerified"], "displayName": u.get("displayName", ""), "providerUserInfo": [{"providerId": "password", "federatedId": e, "email": e, "rawId": e}], "validSince": "0", "lastLoginAt": "0", "createdAt": "0"}]}
        if path.endswith("/token"):
            e = urllib.parse.parse_qs(body)["refresh_token"][0].split(":", 1)[1]
            t = self.token(e); return 200, {"access_token": t, "id_token": t, "refresh_token": "rt:" + e, "expires_in": "3600", "token_type": "Bearer", "user_id": self.users[e]["localId"]}
        self.unhandled.append(path); return 404, {"error": {"code": 404, "message": "NOT_FOUND"}}
    def count(self, name): return self.calls.count(name)

CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}
def install(ctx, be):
    def handler(route):
        req = route.request; be.hosts.add(urllib.parse.urlparse(req.url).hostname)
        if req.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
        raw = req.post_data or ""
        body = raw if "securetoken" in req.url else (json.loads(raw) if raw else {})
        status, payload = be.handle(req.url, body)
        if status == "abort": return route.abort("failed")
        if be.hold and req.url.split('?')[0].endswith('accounts:signInWithPassword'): be.held.append((route, status, payload)); return
        route.fulfill(status=status, headers={**CORS, "content-type": "application/json"}, body=json.dumps(payload))
    ctx.route(re.compile(r"https://(identitytoolkit|securetoken)\.googleapis\.com/.*"), handler)

PW = "Passw0rd!x"
with sync_playwright() as p:
    br = p.chromium.launch()
    errors = []
    def newctx(w=1366, h=900):
        c = br.new_context(viewport={"width": w, "height": h}); pg = c.new_page()
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e))); return c, pg
    def settle(pg): pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(250)
    def fill_reg(pg, name, email, phone, role, pw=PW, confirm=None, terms=True):
        pg.get_by_label("Full name").fill(name); pg.get_by_label("Email").fill(email); pg.locator("input[name=phone]").fill(phone)
        pg.get_by_label("I am registering as").select_option(role)
        pg.get_by_label(re.compile(r"^Password")).fill(pw); pg.get_by_label("Confirm password").fill(confirm or pw)
        if terms: pg.get_by_label(re.compile("I understand")).check()

    # ================= A. Firebase NOT configured =================
    ctx, pg = newctx()
    for path in ["/login", "/register", "/forgot-password"]:
        pg.goto(NOENV + path); settle(pg)
        check(f"[no-env] {path} shows developer-facing config message", "Firebase is not configured" in pg.content() and "VITE_FIREBASE_API_KEY" in pg.content())
    pg.goto(NOENV + "/login"); check("[no-env] login button disabled", pg.get_by_role("button", name="Log in").is_disabled())
    check("[no-env] config message hides placeholder values", "your_firebase_web_api_key" not in pg.content())
    pg.goto(NOENV + "/patient/dashboard"); settle(pg); check("[no-env] protected route -> /login (no crash)", "/login" in pg.url)
    pg.evaluate("localStorage.setItem('rr.session', JSON.stringify({v:1,data:'u-adm-1'}))"); pg.goto(NOENV + "/admin/dashboard"); settle(pg)
    check("[no-env] stale demo session cannot authenticate (prod build)", "/login" in pg.url and pg.evaluate("localStorage.getItem('rr.session')") is None)
    ctx.close()

    # ================= B. Configured (stubbed Firebase backend) =================
    be = Backend(); ctx, pg = newctx(); install(ctx, be)
    pg.goto(CONF + "/patient/dashboard"); settle(pg); check("unauthenticated protected route -> /login", "/login" in pg.url)
    pg.goto(CONF + "/login"); settle(pg); check("no demo-credentials panel in production build", "Developer demo mode" not in pg.content() and "Demo@1234" not in pg.content())

    # --- registration validation
    pg.goto(CONF + "/register"); settle(pg); pg.get_by_role("button", name="Create account").click()
    check("register: empty submit blocked w/ errors, no Firebase call", pg.locator("[role=alert]").count() >= 3 and be.count("accounts:signUp") == 0)
    fill_reg(pg, "Dina Driver", "dina@example.com", "+91 98000 55501", "driver", confirm="Different1")
    pg.get_by_role("button", name="Create account").click(); pg.wait_for_selector("text=Passwords do not match")
    check("register: password mismatch blocked", be.count("accounts:signUp") == 0)
    pg.get_by_label("Confirm password").fill(PW); pg.get_by_label(re.compile("I understand")).uncheck(); pg.get_by_role("button", name="Create account").click(); pg.wait_for_selector("text=accept the demo terms")
    check("register: terms required", be.count("accounts:signUp") == 0)
    check("register: no administrator role offered", "Administrator" not in pg.locator("select").inner_text())
    # --- valid registration
    pg.get_by_label(re.compile("I understand")).check(); pg.get_by_role("button", name="Create account").click()
    pg.wait_for_url(re.compile("/verify-email"), timeout=8000); settle(pg)
    check("register: Firebase signUp called once", be.count("accounts:signUp") == 1)
    check("register: verification email requested", ("verify", "dina@example.com") in be.oob)
    check("register: verify page shows success + address", "verification email was requested" in pg.content() and "dina@example.com" in pg.content())
    check("register: resend disabled during cooldown", pg.get_by_role("button", name=re.compile("Resend in")).is_disabled())
    # secrets
    dump = pg.evaluate("JSON.stringify([localStorage, sessionStorage].map(s=>Object.fromEntries(Object.entries(s))))")
    check("password is not in localStorage/sessionStorage", PW not in dump and "rr.credentials" not in dump)
    fp = json.loads(pg.evaluate("localStorage.getItem('fake.profiles') || '{}'")); mine = [v for v in fp.values() if v["displayName"] == "Dina Driver"]
    check("profile created at registration (unverified, create-only) with role=driver, active, schema v1", len(mine) == 1 and mine[0]["role"] == "driver" and mine[0]["accountStatus"] == "active" and mine[0]["schemaVersion"] == 1)
    check("registration profile contains no password/email/token fields", set(mine[0].keys()) <= {"uid","displayName","phoneNumber","role","accountStatus","schemaVersion","createdAt","updatedAt"})
    # --- unverified cannot access dashboards
    for path in ["/driver/dashboard", "/patient/dashboard", "/admin/dashboard", "/driver/requests"]:
        pg.goto(CONF + path); settle(pg)
        check(f"unverified blocked from {path}", "/verify-email" in pg.url and "Welcome" not in pg.content())
    check("unverified session restored after refresh (still signed in)", "dina@example.com" in pg.content())
    pg.goto(CONF + "/login"); settle(pg); check("unverified visiting /login is sent to verification (no loop)", "/verify-email" in pg.url)
    # --- resend + recheck
    pg.reload(); settle(pg); pg.get_by_role("button", name="Resend verification email").click(); pg.wait_for_selector("text=Verification email requested")
    check("resend calls Firebase again", be.oob.count(("verify", "dina@example.com")) == 2)
    pg.get_by_role("button", name="I've verified my email").click(); pg.wait_for_selector("text=not verified yet")
    check("recheck while unverified stays on verify page", "/verify-email" in pg.url and be.count("accounts:lookup") >= 1)
    be.users["dina@example.com"]["emailVerified"] = True   # simulate clicking the emailed link
    pg.get_by_role("button", name="I've verified my email").click(); pg.wait_for_url(re.compile("/driver/dashboard"), timeout=8000); settle(pg)
    check("after verification: reaches role dashboard without manual refresh", "Welcome, Dina" in pg.content())
    pg.reload(); settle(pg); check("verified session restored on refresh", "/driver/dashboard" in pg.url and "Welcome, Dina" in pg.content())
    pg.goto(CONF + "/admin/dashboard"); settle(pg); check("driver cannot open admin route", "/unauthorized" in pg.url)
    pg.goto(CONF + "/patient/bookings"); settle(pg); check("driver cannot open patient route", "/unauthorized" in pg.url)
    # --- logout
    pg.goto(CONF + "/driver/dashboard"); settle(pg); pg.get_by_role("button", name="Logout").first.click(); pg.wait_for_url(re.compile("/login"), timeout=6000); settle(pg)
    check("logout -> /login", "/login" in pg.url)
    pg.goto(CONF + "/driver/dashboard"); settle(pg); check("after logout protected route redirects", "/login" in pg.url)
    pg.reload(); settle(pg); pg.goto(CONF + "/driver/dashboard"); settle(pg); check("logout persists across refresh (Firebase session cleared)", "/login" in pg.url)

    # --- login
    pg.goto(CONF + "/driver/requests"); settle(pg); check("returnTo: redirected to login with intended page", "/login" in pg.url and "/driver/requests" in pg.content())
    pg.get_by_label("Email").fill("dina@example.com"); pg.get_by_label(re.compile("^Password")).fill("WrongPass1"); pg.get_by_role("button", name="Log in").click()
    pg.wait_for_selector("text=Incorrect email or password"); check("login: wrong password -> friendly generic error", "/login" in pg.url)
    pg.get_by_label("Email").fill("nobody@example.com"); pg.get_by_role("button", name="Log in").click(); pg.wait_for_timeout(600)
    check("login: unknown email shows the SAME generic error (no enumeration)", pg.get_by_text("Incorrect email or password").count() >= 1)
    pg.get_by_label("Email").fill("bad-email"); pg.get_by_role("button", name="Log in").click(); pg.wait_for_selector("text=valid email")
    check("login: invalid email format blocked client-side", True)
    be.hold = True; n0 = be.count("accounts:signInWithPassword")
    pg.get_by_label("Email").fill("dina@example.com"); pg.get_by_label(re.compile("^Password")).fill(PW)
    btn = pg.get_by_role("button", name="Log in"); btn.click(); pg.wait_for_timeout(400)
    check("login: loading state visible, button disabled while request in flight", btn.is_disabled() and btn.get_attribute("aria-busy") == "true")
    try: btn.click(timeout=300, force=True)
    except Exception: pass
    pg.get_by_label("Email").press("Enter"); pg.wait_for_timeout(300)
    be.hold = False
    for r, s, pl in be.held: r.fulfill(status=s, headers={**CORS, "content-type": "application/json"}, body=json.dumps(pl))
    be.held = []
    pg.wait_for_url(re.compile("/driver/requests"), timeout=8000)
    check("login: exactly one Firebase sign-in request despite repeat clicks/Enter", be.count("accounts:signInWithPassword") - n0 == 1, str(be.count("accounts:signInWithPassword") - n0))
    check("login: returnTo honoured after sign-in", "/driver/requests" in pg.url)
    settle(pg); check("login: header/nav show user without refresh", "Dina Driver" in pg.content())
    pg.get_by_role("button", name="Logout").first.click(); pg.wait_for_url(re.compile("/login"))
    # unverified second account via login
    be.users["pat@example.com"] = {"localId": "uid-9", "password": PW, "emailVerified": False}
    pg.get_by_label("Email").fill("pat@example.com"); pg.get_by_label(re.compile("^Password")).fill(PW); pg.get_by_role("button", name="Log in").click()
    pg.wait_for_url(re.compile("/verify-email"), timeout=8000); check("login: unverified user -> verification page, not dashboard", "Welcome" not in pg.content())
    pg.get_by_role("button", name=re.compile("Log out")).click(); pg.wait_for_url(re.compile("/login"))
    # verified unknown-locally account defaults to patient (never admin)
    be.users["lena@example.com"] = {"localId": "uid-10", "password": PW, "emailVerified": True, "displayName": "Lena"}
    pg.get_by_label("Email").fill("lena@example.com"); pg.get_by_label(re.compile("^Password")).fill(PW); pg.get_by_role("button", name="Log in").click()
    pg.wait_for_url(re.compile("/patient/dashboard"), timeout=8000); settle(pg); check("verified account without local profile defaults to Patient", "Welcome, Lena" in pg.content())
    pg.get_by_role("button", name="Logout").first.click(); pg.wait_for_url(re.compile("/login"))
    # admin-email Firebase identity must not become admin
    be.users["admin@rapidrescue.demo"] = {"localId": "uid-11", "password": PW, "emailVerified": True}
    pg.get_by_label("Email").fill("admin@rapidrescue.demo"); pg.get_by_label(re.compile("^Password")).fill(PW); pg.get_by_role("button", name="Log in").click(); pg.wait_for_timeout(1500)
    pg.goto(CONF + "/admin/dashboard"); settle(pg)
    check("Firebase identity with admin email is NOT granted admin", "/admin/dashboard" not in pg.url and "Admin dashboard" not in pg.content())

    # --- duplicate / weak / verification failure / network
    pg.goto(CONF + "/register"); settle(pg); fill_reg(pg, "Dup", "dina@example.com", "+91 98000 55502", "patient"); pg.get_by_role("button", name="Create account").click()
    pg.wait_for_selector("text=may already exist"); check("register: duplicate email -> friendly message, stays on form", "/register" in pg.url)
    be.fail_verify = True; fill_reg(pg, "Eve Patient", "eve@example.com", "+91 98000 55503", "patient"); pg.get_by_role("button", name="Create account").click()
    pg.wait_for_url(re.compile("/verify-email"), timeout=8000); settle(pg)
    check("register: verification-email failure shown accurately (account still created)", "verification email failed" in pg.content() and "Too many attempts" in pg.content() and "email was requested" not in pg.content())
    check("register: failed verification not logged as sent", ("verify", "eve@example.com") not in be.oob)
    pg.reload(); settle(pg); pg.get_by_role("button", name="Resend verification email").click(); pg.wait_for_selector("text=Too many attempts")
    check("resend: rate-limit message surfaced, no success toast", pg.get_by_text("Verification email requested").count() == 0)
    be.fail_verify = False; pg.get_by_role("button", name=re.compile("Log out")).click(); pg.wait_for_url(re.compile("/login"))

    # --- forgot password
    pg.goto(CONF + "/forgot-password"); settle(pg); pg.get_by_role("button", name="Send reset email").click(); pg.wait_for_selector("[role=alert]")
    check("forgot: empty submit blocked", be.count("accounts:sendOobCode") == be.count("accounts:sendOobCode") and not any(k == "reset" for k, _ in be.oob))
    pg.get_by_label("Email").fill("not-an-email"); pg.get_by_role("button", name="Send reset email").click(); pg.wait_for_selector("text=valid email address")
    check("forgot: invalid email blocked", not any(k == "reset" for k, _ in be.oob))
    pg.get_by_label("Email").fill("dina@example.com"); pg.get_by_role("button", name="Send reset email").click(); pg.wait_for_selector("text=If an account exists")
    check("forgot: Firebase reset requested + neutral wording", ("reset", "dina@example.com") in be.oob and "no email has been sent" not in pg.content())
    pg.goto(CONF + "/forgot-password"); settle(pg); pg.get_by_label("Email").fill("ghost@example.com"); pg.get_by_role("button", name="Send reset email").click(); pg.wait_for_selector("text=If an account exists")
    check("forgot: unknown email gets the same neutral result (no enumeration)", True)
    pg.goto(CONF + "/forgot-password"); settle(pg); be.net_fail_oob = True; pg.get_by_label("Email").fill("dina@example.com"); pg.get_by_role("button", name="Send reset email").click(); pg.wait_for_selector("text=Network problem", timeout=15000)
    check("forgot: network failure shown; success NOT claimed", pg.get_by_text("If an account exists").count() == 0); be.net_fail_oob = False
    pg.get_by_role("link", name="Back to log in").click(); settle(pg); check("forgot: login link works", "/login" in pg.url)
    # ===== Phase 3: profile-backed roles =====
    def prof_store(): return json.loads(pg.evaluate("localStorage.getItem('fake.profiles') || '{}'"))
    def login_as(email):
        pg.goto(CONF + "/login"); settle(pg); pg.get_by_label("Email").fill(email); pg.get_by_label(re.compile("^Password")).fill(PW); pg.get_by_role("button", name="Log in").click()
    def logout_btn():
        pg.get_by_role("button", name="Logout").first.click(); pg.wait_for_url(re.compile("/login"), timeout=6000)
    # N1 Console-provisioned admin (role=admin written by a privileged path) may open admin screens (decision D8)
    be.users["boss@example.com"] = {"localId": "uid-boss", "password": PW, "emailVerified": True, "displayName": "Boss"}
    pg.evaluate("""()=>{const m=JSON.parse(localStorage.getItem('fake.profiles')||'{}');m['uid-boss']={uid:'uid-boss',displayName:'Boss Admin',phoneNumber:'',role:'admin',accountStatus:'active',schemaVersion:1,createdAt:null,updatedAt:null};localStorage.setItem('fake.profiles',JSON.stringify(m))}""")
    login_as("boss@example.com"); pg.wait_for_url(re.compile("/admin/dashboard"), timeout=8000); settle(pg)
    check("profile role=admin (trusted source) opens the admin console", "Admin dashboard" in pg.content())
    pg.goto(CONF + "/driver/dashboard"); settle(pg); check("admin is not a driver (role-specific routes still enforced)", "/unauthorized" in pg.url)
    pg.goto(CONF + "/admin/dashboard"); settle(pg); logout_btn()
    # N2 tampering with the local cache cannot change the role used for routing
    login_as("dina@example.com"); pg.wait_for_url(re.compile("/driver/dashboard"), timeout=8000); settle(pg)
    pg.evaluate("""()=>{const s=JSON.parse(localStorage.getItem('rr.state'));s.data.users.forEach(u=>{if(u.email==='dina@example.com')u.role='admin'});localStorage.setItem('rr.state',JSON.stringify(s))}""")
    pg.reload(); settle(pg); pg.goto(CONF + "/admin/dashboard"); settle(pg)
    check("localStorage role spoofing (driver -> admin) does NOT grant admin access", "/unauthorized" in pg.url and "Admin dashboard" not in pg.content())
    pg.goto(CONF + "/driver/dashboard"); settle(pg); check("...and the real (profile) role still works", "Welcome, Dina" in pg.content()); logout_btn()
    # N3 profile load failures: panel with retry + log out, never an infinite spinner
    pg.evaluate("localStorage.setItem('fake.failProfile','permission')"); login_as("lena@example.com"); pg.wait_for_selector("text=couldn't load your profile", timeout=8000); settle(pg)
    check("profile permission error shows a clear panel (no dashboard, no endless spinner)", "Try again" in pg.content() and "Log out" in pg.content() and "Welcome" not in pg.content() and "permission denied" in pg.content())
    pg.goto(CONF + "/patient/dashboard"); settle(pg); check("guarded route also shows the panel instead of redirect-looping", "couldn't load your profile" in pg.content() and "/patient/dashboard" in pg.url)
    pg.evaluate("localStorage.removeItem('fake.failProfile')"); pg.get_by_role("button", name="Try again").click(); pg.wait_for_selector("text=Welcome, Lena", timeout=8000)
    check("Try again recovers once the problem is fixed", "/patient/dashboard" in pg.url)
    pg.evaluate("localStorage.setItem('fake.failProfile','network')"); pg.reload(); pg.wait_for_selector("text=couldn't load your profile", timeout=8000)
    check("offline/network profile error is reported accurately after refresh", "reach the profile service" in pg.content())
    pg.get_by_role("button", name="Log out").click(); pg.wait_for_url(re.compile("/login"), timeout=6000); pg.evaluate("localStorage.removeItem('fake.failProfile')")
    check("Log out works from the error panel", "/login" in pg.url)
    # N4 deactivated account (accountStatus set by a privileged write) cannot stay signed in
    be.users["gone@example.com"] = {"localId": "uid-gone", "password": PW, "emailVerified": True, "displayName": "Gone User"}
    pg.evaluate("""()=>{const m=JSON.parse(localStorage.getItem('fake.profiles')||'{}');m['uid-gone']={uid:'uid-gone',displayName:'Gone User',phoneNumber:'',role:'patient',accountStatus:'inactive',schemaVersion:1,createdAt:null,updatedAt:null};localStorage.setItem('fake.profiles',JSON.stringify(m))}""")
    login_as("gone@example.com"); pg.wait_for_selector("text=deactivated", timeout=8000); pg.wait_for_timeout(500)
    pg.goto(CONF + "/patient/dashboard"); settle(pg); check("deactivated profile: signed out with message, dashboard unreachable", "/login" in pg.url)
    # N5/N6 missing profile -> safe default; profile edits persist remotely, and failures do not diverge local state
    ps = prof_store(); lena = ps.get("uid-10")
    check("missing profile auto-created as patient (never driver/admin), one doc per uid", lena is not None and lena["role"] == "patient" and lena["accountStatus"] == "active")
    login_as("lena@example.com"); pg.wait_for_url(re.compile("/patient/dashboard"), timeout=8000); pg.goto(CONF + "/patient/profile"); settle(pg)
    pg.get_by_label("Full name").fill("Lena Edited"); pg.locator("input[name=phone]").fill("+91 98000 33333"); pg.get_by_role("button", name="Save profile").click(); pg.wait_for_selector("text=Profile saved")
    check("profile edit persists to the profile layer (displayName)", prof_store()["uid-10"]["displayName"] == "Lena Edited")
    check("trusted fields unchanged by a profile edit", prof_store()["uid-10"]["role"] == "patient" and prof_store()["uid-10"]["accountStatus"] == "active")
    pg.evaluate("localStorage.setItem('fake.failUpdate','1')"); pg.get_by_label("Full name").fill("Should Not Stick"); pg.locator("input[name=phone]").fill("+91 98000 44444"); pg.get_by_role("button", name="Save profile").click()
    pg.wait_for_selector("text=permission denied", timeout=6000); pg.evaluate("localStorage.removeItem('fake.failUpdate')")
    pg.goto(CONF + "/patient/profile"); settle(pg)
    check("failed remote save is reported and local copy is NOT changed (no divergence)", pg.get_by_label("Full name").input_value() == "Lena Edited" and prof_store()["uid-10"]["displayName"] == "Lena Edited")
    logout_btn()
    # N7 registration profile failure: intent kept locally and honoured after verification (role not silently lost)
    pg.evaluate("localStorage.setItem('fake.failCreate','1')"); pg.goto(CONF + "/register"); settle(pg)
    fill_reg(pg, "Frank Driver", "frank@example.com", "+91 98000 55504", "driver"); pg.get_by_role("button", name="Create account").click()
    pg.wait_for_url(re.compile("/verify-email"), timeout=8000); settle(pg)
    check("registration with a failed profile save warns accurately (account still created)", "profile was not saved yet" in pg.content())
    pending = pg.evaluate("localStorage.getItem('rr.pendingProfile')") or ""
    check("pending registration intent stored without password/token", "driver" in pending and PW not in pending and "token" not in pending.lower())
    pg.evaluate("localStorage.removeItem('fake.failCreate')"); be.users["frank@example.com"]["emailVerified"] = True
    pg.get_by_role("button", name="I've verified my email").click(); pg.wait_for_url(re.compile("/driver/dashboard"), timeout=8000); settle(pg)
    frank = [v for v in prof_store().values() if v["displayName"] == "Frank Driver"]
    check("after verification the retried profile uses the chosen role (driver) and clears the pending intent", len(frank) == 1 and frank[0]["role"] == "driver" and not pg.evaluate("localStorage.getItem('rr.pendingProfile')"))
    logout_btn()
    check("ID token force-refreshed after verification (stale email_verified claim mitigation)", be.count("token") >= 1)
    # ===== Phase 4: patient profile + dashboard integration =====
    def body(): return pg.locator("body").inner_text()
    def upd_count(): return int(pg.evaluate("localStorage.getItem('fake.updateCount') || '0'"))
    def set_remote(uid, **kw): pg.evaluate("([u,kw])=>{const m=JSON.parse(localStorage.getItem('fake.profiles')||'{}');m[u]={...m[u],...kw};localStorage.setItem('fake.profiles',JSON.stringify(m))}", [uid, kw])
    # P0 unauthenticated deep link -> login -> back to the intended profile page
    pg.goto(CONF + "/patient/profile"); settle(pg); check("[P4] unauthenticated profile URL redirects to login (existing behaviour)", "/login" in pg.url)
    pg.get_by_label("Email").fill("lena@example.com"); pg.get_by_label(re.compile("^Password")).fill(PW); pg.get_by_role("button", name="Log in").click()
    pg.wait_for_url(re.compile("/patient/profile"), timeout=8000); settle(pg); check("[P4] after login the user returns to the profile page they asked for", "/patient/profile" in pg.url)
    check("[P4] profile form is populated from the stored profile", pg.get_by_label("Full name").input_value() == "Lena Edited" and pg.locator("input[name=phone]").input_value() == "+91 98000 33333")
    em = pg.get_by_label("Email")
    check("[P4] email comes from Firebase Auth and is read-only", em.input_value() == "lena@example.com" and em.is_disabled() and "from Firebase Authentication" in body())
    check("[P4] local-only fields are honestly labelled", body().count("Saved on this device only") == 3)
    # live tamper of the local cache (simulates another tab / devtools): display must still come from the profile
    pg.evaluate("""()=>{const s=JSON.parse(localStorage.getItem('rr.state'));s.data.users.forEach(u=>{if(u.email==='lena@example.com'){u.name='Tampered Local';u.phone='000';u.role='admin'}});localStorage.setItem('rr.state',JSON.stringify(s));window.dispatchEvent(new StorageEvent('storage',{key:'rr.state'}))}""")
    pg.wait_for_timeout(300); pg.get_by_role("link", name="Dashboard").first.click(); pg.wait_for_url(re.compile("/patient/dashboard")); settle(pg)
    check("[P4] dashboard ignores a tampered local cache (shows the profile name/phone, role stays patient)", "Welcome, Lena" in body() and "Tampered Local" not in body() and "/patient/dashboard" in pg.url)
    # profile changed elsewhere -> a fresh load shows the stored value (not stale local data)
    set_remote("uid-10", displayName="Remote Person"); pg.reload(); settle(pg)
    check("[P4] after refresh the dashboard shows the current stored profile", "Welcome, Remote" in body() and "Remote Person" in body() and "lena@example.com" in body() and "+91 98000 33333" in body())
    check("[P4] stat cards and booking sections are labelled demo data; nothing seeded for a new patient", body().count("Demo data") >= 6 and "RR-20" not in body() and "No active booking" in body() and "No bookings yet" in body())
    # save: name changed -> exactly one remote write, then every view agrees
    pg.goto(CONF + "/patient/profile"); settle(pg); c0 = upd_count()
    pg.get_by_label("Full name").fill("  Zed Edited  "); pg.get_by_role("button", name="Save profile").click(); pg.wait_for_selector("text=Profile saved")
    check("[P4] name edit saved with exactly one Firestore write (whitespace trimmed)", upd_count() == c0 + 1 and prof_store()["uid-10"]["displayName"] == "Zed Edited")
    check("[P4] header and dashboard update immediately without a reload", "Zed Edited" in pg.locator("body").inner_text())
    pg.get_by_role("link", name="Dashboard").first.click(); pg.wait_for_url(re.compile("/patient/dashboard")); settle(pg)
    check("[P4] dashboard shows the saved name via client-side navigation", "Welcome, Zed" in body() and "Zed Edited" in body())
    pg.reload(); settle(pg); pg.goto(CONF + "/patient/profile"); settle(pg)
    check("[P4] saved profile persists across refresh (session restoration)", pg.get_by_label("Full name").input_value() == "Zed Edited")
    ps = prof_store()["uid-10"]
    check("[P4] stored profile has only schema fields and trusted fields untouched", set(ps.keys()) <= {"uid","displayName","phoneNumber","role","accountStatus","schemaVersion","createdAt","updatedAt"} and ps["role"] == "patient" and ps["accountStatus"] == "active" and ps["uid"] == "uid-10")
    # local-only fields: saved locally, NO remote write
    c1 = upd_count(); pg.locator("input[name=address]").fill("Local Street 1"); pg.get_by_role("button", name="Save profile").click(); pg.wait_for_selector("text=Profile saved")
    check("[P4] changing only address/emergency contact does not write to Firestore", upd_count() == c1 and "address" not in prof_store()["uid-10"])
    pg.reload(); settle(pg); pg.goto(CONF + "/patient/profile"); settle(pg)
    check("[P4] local-only address persists on this device", pg.locator("input[name=address]").input_value() == "Local Street 1")
    # validation: invalid phone blocked, no write, no success
    c2 = upd_count(); pg.locator("input[name=phone]").fill("abc"); pg.get_by_role("button", name="Save profile").click(); pg.wait_for_selector("text=valid phone")
    check("[P4] invalid phone is rejected with a field error, no write, no success toast", upd_count() == c2 and pg.get_by_text("Profile saved").count() == 0)
    pg.get_by_role("button", name="Cancel changes").click()
    # failed write: no false success; entered values preserved; displayed profile unchanged
    pg.evaluate("localStorage.setItem('fake.failUpdate','1')"); c3 = upd_count()
    pg.get_by_label("Full name").fill("Should Fail"); pg.get_by_role("button", name="Save profile").click(); pg.wait_for_selector("text=permission denied", timeout=6000)
    check("[P4] failed write: error shown, no success toast, entered value preserved, no write recorded", pg.get_by_text("Profile saved").count() == 0 and pg.get_by_label("Full name").input_value() == "Should Fail" and upd_count() == c3)
    pg.get_by_role("link", name="Dashboard").first.click(); pg.wait_for_url(re.compile("/patient/dashboard")); settle(pg)
    check("[P4] after a failed save the dashboard still shows the stored name", "Zed Edited" in body() and "Should Fail" not in body())
    pg.evaluate("localStorage.removeItem('fake.failUpdate')")
    # sign-out and account switching: nothing from the previous user is shown
    logout_btn(); settle(pg)  # let the route transition commit (the previous route's DOM can linger for a frame)
    check("[P4] after sign-out the previous user's name is gone from the page", "Zed Edited" not in body())
    be.users["pia@example.com"] = {"localId": "uid-pia", "password": PW, "emailVerified": True, "displayName": "Pia"}
    login_as("pia@example.com"); pg.wait_for_url(re.compile("/patient/dashboard"), timeout=8000); settle(pg)
    check("[P4] switching accounts shows only the new user's data (no leakage)", "Welcome, Pia" in body() and "Zed" not in body() and "lena@example.com" not in body() and "Local Street 1" not in body())
    check("[P4] new patient: missing phone and empty states handled", "Phone not set" in body() and "No bookings yet" in body())
    pg.goto(CONF + "/patient/profile"); settle(pg); check("[P4] other user's local-only address is not shown to the new user", pg.locator("input[name=address]").input_value() == "")
    logout_btn()
    # role and verification gates still enforced on the profile page
    login_as("dina@example.com"); pg.wait_for_url(re.compile("/driver/dashboard"), timeout=8000); settle(pg)
    pg.goto(CONF + "/patient/profile"); settle(pg); check("[P4] a driver cannot open the patient profile", "/unauthorized" in pg.url); pg.goto(CONF + "/driver/dashboard"); settle(pg); logout_btn()
    login_as("pat@example.com"); pg.wait_for_url(re.compile("/verify-email"), timeout=8000)
    pg.goto(CONF + "/patient/profile"); settle(pg); check("[P4] unverified user cannot open the patient profile", "/verify-email" in pg.url and "Full name" not in body())
    pg.goto(CONF + "/patient/dashboard"); settle(pg); check("[P4] unverified user cannot open the patient dashboard", "/verify-email" in pg.url)
    pg.get_by_role("button", name=re.compile("Log out")).click(); pg.wait_for_url(re.compile("/login"))
    # ===== Phase 5: driver profile + dashboard integration =====
    def drv_login(email):
        login_as(email); pg.wait_for_url(re.compile("/driver/dashboard"), timeout=8000); settle(pg)
    pg.goto(CONF + "/driver/profile"); settle(pg); check("[P5] unauthenticated driver profile URL redirects to login", "/login" in pg.url)
    pg.get_by_label("Email").fill("dina@example.com"); pg.get_by_label(re.compile("^Password")).fill(PW); pg.get_by_role("button", name="Log in").click()
    pg.wait_for_url(re.compile("/driver/profile"), timeout=8000); settle(pg); check("[P5] after login the driver returns to the profile page they asked for", "/driver/profile" in pg.url)
    check("[P5] driver form is populated from the stored profile", pg.get_by_label("Full name").input_value() == "Dina Driver" and pg.locator("input[name=phone]").input_value() == "+91 98000 55501")
    em = pg.get_by_label("Email")
    check("[P5] driver email comes from Firebase Auth and is read-only", em.input_value() == "dina@example.com" and em.is_disabled() and "from Firebase Authentication" in body())
    check("[P5] driver record is honestly labelled demo data with no approval claim", "Demo data on this device" in body() and "Driver approval is not implemented yet" in body() and "Managed by administrators" not in body())
    check("[P5] driver record fields are not in the stored profile", not (set(prof_store()["uid-1"].keys()) & {"driverCode","licenseNumber","ambulanceId","availability","approvalStatus","approved"}))
    pg.evaluate("""()=>{const s=JSON.parse(localStorage.getItem('rr.state'));s.data.users.forEach(u=>{if(u.email==='dina@example.com'){u.name='Tampered Local';u.phone='000';u.role='admin'}});localStorage.setItem('rr.state',JSON.stringify(s));window.dispatchEvent(new StorageEvent('storage',{key:'rr.state'}))}""")
    pg.wait_for_timeout(300); pg.get_by_role("link", name="Dashboard").first.click(); pg.wait_for_url(re.compile("/driver/dashboard")); settle(pg)
    check("[P5] driver dashboard ignores a tampered local cache (profile name/phone shown, still a driver)", "Welcome, Dina" in body() and "Tampered Local" not in body() and "+91 98000 55501" in body())
    pg.goto(CONF + "/admin/dashboard"); settle(pg); check("[P5] local role spoofing does not open the admin console for a driver", "/unauthorized" in pg.url)
    set_remote("uid-1", displayName="Remote Driver"); pg.goto(CONF + "/driver/dashboard"); pg.reload(); settle(pg)
    check("[P5] after refresh the dashboard shows the current stored profile", "Welcome, Remote" in body() and "Remote Driver" in body())
    check("[P5] demo status/stat cards labelled; no assignments, trips or ambulance presented as real", body().count("Demo data") >= 4 and "Demo status (this device only)" in body() and "RR-20" not in body() and "No current assignment" in body() and "No ambulance assigned" in body(), "demo=%d status=%s rr=%s noassign=%s noamb=%s" % (body().count("Demo data"), "Demo status (this device only)" in body(), "RR-20" in body(), "No current assignment" in body(), "No ambulance assigned" in body()))
    pg.goto(CONF + "/driver/profile"); settle(pg); c0 = upd_count()
    pg.get_by_label("Full name").fill("  Dana Updated  "); pg.get_by_role("button", name="Save", exact=True).click(); pg.wait_for_selector("text=Profile saved")
    check("[P5] driver name edit saved with exactly one Firestore write (trimmed)", upd_count() == c0 + 1 and prof_store()["uid-1"]["displayName"] == "Dana Updated")
    check("[P5] header updates immediately without a reload", "Dana Updated" in body())
    pg.get_by_role("link", name="Dashboard").first.click(); pg.wait_for_url(re.compile("/driver/dashboard")); settle(pg)
    check("[P5] dashboard shows the saved name via client-side navigation", "Welcome, Dana" in body())
    pg.reload(); settle(pg); pg.goto(CONF + "/driver/profile"); settle(pg)
    check("[P5] saved driver profile persists across refresh", pg.get_by_label("Full name").input_value() == "Dana Updated")
    d1 = prof_store()["uid-1"]
    check("[P5] role and trusted fields unchanged after edit; only schema fields stored", d1["role"] == "driver" and d1["accountStatus"] == "active" and set(d1.keys()) <= {"uid","displayName","phoneNumber","role","accountStatus","schemaVersion","createdAt","updatedAt"})
    c1 = upd_count(); pg.locator("input[name=phone]").fill("abc"); pg.get_by_role("button", name="Save", exact=True).click(); pg.wait_for_selector("text=valid phone")
    check("[P5] invalid driver phone rejected: field error, no write, no success", upd_count() == c1 and pg.get_by_text("Profile saved").count() == 0)
    pg.get_by_role("button", name="Cancel changes").click()
    pg.evaluate("localStorage.setItem('fake.failUpdate','1')"); c2 = upd_count()
    pg.get_by_label("Full name").fill("Should Fail"); pg.get_by_role("button", name="Save", exact=True).click(); pg.wait_for_selector("text=permission denied", timeout=6000)
    check("[P5] failed driver write: error shown, no success, values preserved, nothing written", pg.get_by_text("Profile saved").count() == 0 and pg.get_by_label("Full name").input_value() == "Should Fail" and upd_count() == c2)
    pg.get_by_role("link", name="Dashboard").first.click(); pg.wait_for_url(re.compile("/driver/dashboard")); settle(pg)
    check("[P5] dashboard still shows the stored name after a failed save", "Dana Updated" in body() and "Should Fail" not in body())
    pg.evaluate("localStorage.removeItem('fake.failUpdate')")
    # availability is local demo state: toggling must not touch Firestore
    c3 = upd_count(); keys_before = sorted(prof_store()["uid-1"].keys())
    pg.get_by_role("switch").first.click(); pg.wait_for_selector("text=You are online", timeout=6000)
    check("[P5] availability toggle is local demo state (no Firestore write, no new profile field)", upd_count() == c3 and sorted(prof_store()["uid-1"].keys()) == keys_before)
    pg.get_by_role("switch").first.click(); pg.wait_for_selector("text=You are offline", timeout=6000)
    # sign-out / account switching between two drivers
    logout_btn(); settle(pg); check("[P5] after sign-out the previous driver's name is gone", "Dana Updated" not in body())
    drv_login("frank@example.com")
    check("[P5] switching to another driver shows only that driver's data (no leakage)", "Welcome, Frank" in body() and "Dana" not in body() and "Remote" not in body() and "dina@example.com" not in body())
    check("[P5] second driver starts empty: no trips, no assignment, no ambulance", "No current assignment" in body() and "No ambulance assigned" in body() and "RR-20" not in body())
    pg.goto(CONF + "/patient/dashboard"); settle(pg); check("[P5] a driver cannot open patient pages", "/unauthorized" in pg.url)
    pg.goto(CONF + "/driver/dashboard"); settle(pg); logout_btn()
    login_as("pia@example.com"); pg.wait_for_url(re.compile("/patient/dashboard"), timeout=8000)
    pg.goto(CONF + "/driver/profile"); settle(pg); check("[P5] a patient cannot open driver pages", "/unauthorized" in pg.url and "Full name" not in body())
    pg.goto(CONF + "/patient/dashboard"); settle(pg); logout_btn()
    login_as("pat@example.com"); pg.wait_for_url(re.compile("/verify-email"), timeout=8000)
    pg.goto(CONF + "/driver/profile"); settle(pg); check("[P5] unverified user cannot open driver pages", "/verify-email" in pg.url and "Full name" not in body())
    pg.get_by_role("button", name=re.compile("Log out")).click(); pg.wait_for_url(re.compile("/login"))
    check("all Firebase traffic went only to identitytoolkit/securetoken hosts", be.hosts <= {"identitytoolkit.googleapis.com", "securetoken.googleapis.com"}, str(be.hosts))
    check("no unhandled Firebase endpoints hit", not be.unhandled, str(be.unhandled))
    ctx.close()

    # ================= C. Responsive on auth pages (375px) & public regression =================
    be2 = Backend(); ctx, pg = newctx(375, 800); install(ctx, be2); bad = []
    for path in ["/", "/login", "/register", "/forgot-password", "/verify-email", "/nope"]:
        pg.goto(CONF + path); settle(pg)
        if pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1"): bad.append(path)
    check("no horizontal overflow on public/auth pages @375px", not bad, ",".join(bad))
    pg.goto(CONF + "/"); settle(pg); check("landing page still renders", "ETA-based" in pg.content())
    pg.goto(CONF + "/nope"); settle(pg); check("404 route still works", "Page not found" in pg.content())
    pg.goto(CONF + "/unauthorized"); settle(pg); check("unauthorized route still works", "don't have access" in pg.content())
    ctx.close()
    real = [e for e in errors if "tile.openstreetmap" not in e and "ERR_" not in e and "Failed to load resource" not in e]
    check("no unexpected console/page errors in auth flows", not real, " | ".join(real[:3]))
    br.close()
bad = [r for r in results if not r[1]]
print(f"\n{len(results)-len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
