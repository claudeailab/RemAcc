// Posts WM_SYSCOMMAND ID_DESKTOP to any VNCMDI_Window on the current DISPLAY.
// Each DSM session runs on its own Xvfb display, so there is at most one such window.
// ID_DESKTOP = 50111 confirmed from UltraVNC vncviewer/res/resource.h.
#include <windows.h>

#define ID_DESKTOP 50111

static int sent;

static BOOL CALLBACK visit(HWND hwnd, LPARAM unused) {
  wchar_t cls[64];
  if (!GetClassNameW(hwnd, cls, 64) || wcscmp(cls, L"VNCMDI_Window")) return TRUE;
  PostMessageW(hwnd, WM_SYSCOMMAND, ID_DESKTOP, 0);
  sent++;
  return TRUE;
}

int wmain(int argc, wchar_t **argv) {
  (void)argc; (void)argv;
  EnumWindows(visit, 0);
  return sent ? 0 : 1;
}
