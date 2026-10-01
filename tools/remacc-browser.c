// Minimal WebKitGTK browser for RemAcc web connections: one undecorated window filling the
// X display, no browser UI. Reads "url\0username\0password\0" from stdin (never argv/env).
#include <gtk/gtk.h>
#include <webkit2/webkit2.h>
#include <string.h>

static WebKitWebView *view;
static WebKitUserContentManager *ucm;
static gchar *home_url, *user, *pass, *host;
static int submits_left = 2; // a username step + a password step; never loops on a wrong password

// Fills login forms on the configured host only, in an isolated script world the page cannot read
static const char *AUTOFILL_JS =
  "(() => {"
  "const dec = s => new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0)));"
  "const U = dec('%s'), P = dec('%s'), SUBMIT = %d;"
  "const TEXT = 'input:not([type]),input[type=text],input[type=email],input[type=tel]';"
  "const visible = e => !e.disabled && !e.readOnly && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';"
  "const fill = (e, v) => { e.focus(); e.value = v;"
  "  e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };"
  "const userish = e => e.autocomplete === 'username' || e.type === 'email' ||"
  "  /user|login|e-?mail|account/i.test([e.name, e.id, e.placeholder, e.getAttribute('aria-label')].join(' '));"
  "const BTN = /^\\s*(log\\s*-?\\s*in|sign\\s*-?\\s*in|submit|continue|next|ok|anmelden|connexion)\\s*$/i;"
  "let submitted = false, timer = 0;"
  "function submit(field) {"
  "  const form = field.form;"
  "  const btn = (form && [...form.querySelectorAll('button[type=submit],input[type=submit],button:not([type])')].find(visible))"
  "    || [...document.querySelectorAll('button,input[type=submit],input[type=button],[role=button]')].filter(visible)"
  "         .find(b => BTN.test(b.value || b.textContent || ''));"
  "  if (btn) btn.click();"
  "  else if (form) form.requestSubmit();"
  "  else ['keydown', 'keypress', 'keyup'].forEach(t => field.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })));"
  "  window.webkit.messageHandlers.remacc.postMessage('submitted');"
  "}"
  "function run() {"
  "  if (submitted) return;"
  "  const pw = [...document.querySelectorAll('input[type=password]')].filter(visible).find(e => e.autocomplete !== 'new-password');"
  "  let target = null;"
  "  if (pw) {"
  "    const scope = pw.form || document;"
  "    const u = [...scope.querySelectorAll(TEXT)].filter(e => visible(e) && (e.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING)).pop();"
  "    if (u && U && !u.value) fill(u, U);"
  "    if (P && !pw.value) fill(pw, P);"
  "    if (pw.value === P && (!u || u.value)) target = pw;"
  "  } else if (U) {"
  "    const u = [...document.querySelectorAll(TEXT)].filter(visible).find(userish);"
  "    if (u && !u.value) { fill(u, U); target = u; }"
  "  }"
  "  if (target && SUBMIT) { submitted = true; setTimeout(() => submit(target), 400); }"
  "}"
  "run();"
  "new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(run, 250); })"
  "  .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['type', 'style', 'class', 'hidden'] });"
  "})();";

static void install_autofill(void) {
  webkit_user_content_manager_remove_all_scripts(ucm);
  if (!host || (!*user && !*pass)) return;
  gchar *u64 = g_base64_encode((const guchar *)user, strlen(user));
  gchar *p64 = g_base64_encode((const guchar *)pass, strlen(pass));
  gchar *src = g_strdup_printf(AUTOFILL_JS, u64, p64, submits_left > 0);
  gchar *http = g_strdup_printf("http://%s/*", host), *https = g_strdup_printf("https://%s/*", host);
  const gchar *allow[] = { http, https, NULL };
  WebKitUserScript *s = webkit_user_script_new_for_world(src, WEBKIT_USER_CONTENT_INJECT_ALL_FRAMES,
    WEBKIT_USER_SCRIPT_INJECT_AT_DOCUMENT_END, "remacc", allow, NULL);
  webkit_user_content_manager_add_script(ucm, s);
  webkit_user_script_unref(s);
  g_free(http); g_free(https); g_free(src); g_free(u64); g_free(p64);
}

static void on_submitted(WebKitUserContentManager *m, WebKitJavascriptResult *r, gpointer d) {
  if (--submits_left <= 0) install_autofill(); // later pages are filled but no longer submitted
}

// HTTP Basic/Digest/NTLM logins on the configured host
static gboolean on_authenticate(WebKitWebView *v, WebKitAuthenticationRequest *req, gpointer d) {
  WebKitAuthenticationScheme sc = webkit_authentication_request_get_scheme(req);
  if (!*user || webkit_authentication_request_is_retry(req)
      || g_strcmp0(webkit_authentication_request_get_host(req), host) != 0
      || sc == WEBKIT_AUTHENTICATION_SCHEME_CLIENT_CERTIFICATE_REQUESTED
      || sc == WEBKIT_AUTHENTICATION_SCHEME_SERVER_TRUST_EVALUATION_REQUESTED) return FALSE;
  WebKitCredential *c = webkit_credential_new(user, pass, WEBKIT_CREDENTIAL_PERSISTENCE_FOR_SESSION);
  webkit_authentication_request_authenticate(req, c);
  webkit_credential_free(c);
  return TRUE;
}

static gboolean allowed_scheme(const gchar *uri) {
  gchar *s = g_uri_parse_scheme(uri ? uri : "");
  gboolean ok = s && (!g_ascii_strcasecmp(s, "http") || !g_ascii_strcasecmp(s, "https")
    || !g_ascii_strcasecmp(s, "about") || !g_ascii_strcasecmp(s, "data") || !g_ascii_strcasecmp(s, "blob"));
  g_free(s);
  return ok;
}

// Only web pages (never file://, view-source:, …), and nothing that would be a download
static gboolean on_decide_policy(WebKitWebView *v, WebKitPolicyDecision *dec, WebKitPolicyDecisionType type, gpointer d) {
  if (type == WEBKIT_POLICY_DECISION_TYPE_RESPONSE) {
    if (!webkit_response_policy_decision_is_mime_type_supported(WEBKIT_RESPONSE_POLICY_DECISION(dec))) {
      webkit_policy_decision_ignore(dec);
      return TRUE;
    }
    return FALSE;
  }
  WebKitNavigationAction *a = webkit_navigation_policy_decision_get_navigation_action(WEBKIT_NAVIGATION_POLICY_DECISION(dec));
  if (!allowed_scheme(webkit_uri_request_get_uri(webkit_navigation_action_get_request(a)))) {
    webkit_policy_decision_ignore(dec);
    return TRUE;
  }
  return FALSE;
}

// Popups and target=_blank open in the same view: there is only one window
static GtkWidget *on_create(WebKitWebView *v, WebKitNavigationAction *a, gpointer d) {
  WebKitURIRequest *r = webkit_navigation_action_get_request(a);
  if (allowed_scheme(webkit_uri_request_get_uri(r))) webkit_web_view_load_request(view, r);
  return NULL;
}

static void on_download(WebKitWebContext *c, WebKitDownload *dl, gpointer d) { webkit_download_cancel(dl); }
static gboolean on_close(WebKitWebView *v, gpointer d) { return TRUE; } // window.close() keeps the session
static void on_crash(WebKitWebView *v, WebKitWebProcessTerminationReason r, gpointer d) { webkit_web_view_reload(view); }

// Toolbar keys sent by RemAcc: Alt+Left/Right back/forward, F5 / Ctrl+R reload, Alt+Home home
static gboolean on_key(GtkWidget *w, GdkEventKey *e, gpointer d) {
  guint mods = e->state & gtk_accelerator_get_default_mod_mask();
  if (mods == GDK_MOD1_MASK && e->keyval == GDK_KEY_Left) { webkit_web_view_go_back(view); return TRUE; }
  if (mods == GDK_MOD1_MASK && e->keyval == GDK_KEY_Right) { webkit_web_view_go_forward(view); return TRUE; }
  if (mods == GDK_MOD1_MASK && e->keyval == GDK_KEY_Home) { webkit_web_view_load_uri(view, home_url); return TRUE; }
  if ((!mods && e->keyval == GDK_KEY_F5) || (mods == GDK_CONTROL_MASK && (e->keyval == GDK_KEY_r || e->keyval == GDK_KEY_R))) {
    webkit_web_view_reload(view); return TRUE;
  }
  return FALSE;
}

int main(int argc, char **argv) {
  GString *in = g_string_new(NULL);
  char buf[4096];
  size_t n;
  while ((n = fread(buf, 1, sizeof buf, stdin)) > 0) g_string_append_len(in, buf, n);
  const char *p = in->str, *end = in->str + in->len;
  home_url = g_strdup(p); p += strlen(p) + 1;
  user = g_strdup(p < end ? p : ""); p += strlen(user) + 1;
  pass = g_strdup(p < end ? p : "");
  memset(in->str, 0, in->len);
  g_string_free(in, TRUE);
  GUri *u = g_uri_parse(home_url, G_URI_FLAGS_NONE, NULL);
  if (!u || !allowed_scheme(home_url)) { g_printerr("invalid url\n"); return 2; }
  host = g_strdup(g_uri_get_host(u));
  g_uri_unref(u);

  gtk_init(&argc, &argv);
  WebKitWebsiteDataManager *dm = webkit_website_data_manager_new_ephemeral();
  webkit_website_data_manager_set_tls_errors_policy(dm, WEBKIT_TLS_ERRORS_POLICY_IGNORE); // self-signed internal sites
  WebKitWebContext *ctx = webkit_web_context_new_with_website_data_manager(dm);
  webkit_web_context_set_cache_model(ctx, WEBKIT_CACHE_MODEL_DOCUMENT_VIEWER);
  g_signal_connect(ctx, "download-started", G_CALLBACK(on_download), NULL);

  ucm = webkit_user_content_manager_new();
  webkit_user_content_manager_register_script_message_handler_in_world(ucm, "remacc", "remacc");
  g_signal_connect(ucm, "script-message-received::remacc", G_CALLBACK(on_submitted), NULL);
  install_autofill();

  WebKitSettings *st = webkit_settings_new_with_settings(
    "enable-developer-extras", FALSE,
    "enable-webgl", FALSE,
    "hardware-acceleration-policy", WEBKIT_HARDWARE_ACCELERATION_POLICY_NEVER,
    "javascript-can-open-windows-automatically", TRUE,
    NULL);
  view = WEBKIT_WEB_VIEW(g_object_new(WEBKIT_TYPE_WEB_VIEW, "web-context", ctx, "user-content-manager", ucm, "settings", st, NULL));
  g_signal_connect(view, "authenticate", G_CALLBACK(on_authenticate), NULL);
  g_signal_connect(view, "decide-policy", G_CALLBACK(on_decide_policy), NULL);
  g_signal_connect(view, "create", G_CALLBACK(on_create), NULL);
  g_signal_connect(view, "close", G_CALLBACK(on_close), NULL);
  g_signal_connect(view, "web-process-terminated", G_CALLBACK(on_crash), NULL);

  GtkWidget *win = gtk_window_new(GTK_WINDOW_TOPLEVEL);
  GdkDisplay *dpy = gdk_display_get_default();
  GdkMonitor *mon = gdk_display_get_primary_monitor(dpy);
  GdkRectangle geo;
  gdk_monitor_get_geometry(mon ? mon : gdk_display_get_monitor(dpy, 0), &geo);
  gtk_window_set_decorated(GTK_WINDOW(win), FALSE);
  gtk_window_set_default_size(GTK_WINDOW(win), geo.width, geo.height);
  gtk_window_move(GTK_WINDOW(win), 0, 0);
  gtk_container_add(GTK_CONTAINER(win), GTK_WIDGET(view));
  g_signal_connect(win, "key-press-event", G_CALLBACK(on_key), NULL);
  g_signal_connect(win, "destroy", G_CALLBACK(gtk_main_quit), NULL);
  gtk_widget_show_all(win);
  gtk_widget_grab_focus(GTK_WIDGET(view));
  webkit_web_view_load_uri(view, home_url);
  gtk_main();
  return 0;
}
