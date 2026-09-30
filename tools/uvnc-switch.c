// Presses UltraVNC viewer's "Select full desktop / switch monitor" (ID_DESKTOP) in the viewer
// started from the given exe file name; runs under Wine next to the DSM relay's viewer.
#include <windows.h>
#include <wchar.h>

#define ID_DESKTOP 50111

static const wchar_t *want;
static int sent;

static BOOL CALLBACK visit(HWND hwnd, LPARAM unused) {
  wchar_t cls[64], path[MAX_PATH];
  DWORD pid = 0, n = MAX_PATH;
  if (!GetClassNameW(hwnd, cls, 64) || wcscmp(cls, L"VNCMDI_Window")) return TRUE;
  GetWindowThreadProcessId(hwnd, &pid);
  HANDLE proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!proc) return TRUE;
  BOOL ok = QueryFullProcessImageNameW(proc, 0, path, &n);
  CloseHandle(proc);
  const wchar_t *base = wcsrchr(path, L'\\');
  if (ok && !_wcsicmp(base ? base + 1 : path, want)) {
    PostMessageW(hwnd, WM_SYSCOMMAND, ID_DESKTOP, 0);
    sent++;
  }
  return TRUE;
}

int wmain(int argc, wchar_t **argv) {
  if (argc < 2) return 2;
  want = argv[1];
  EnumWindows(visit, 0);
  return sent ? 0 : 1;
}
