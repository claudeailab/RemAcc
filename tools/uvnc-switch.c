// Talks to the UltraVNC viewer started from the given exe file name (all DSM sessions share one
// wineserver, so the exe name picks this session's viewer). Runs under Wine.
//   uvnc-switch.exe <exe> switch  press "Select full desktop / switch monitor" (next remote monitor)
//   uvnc-switch.exe <exe> count   print the monitor count the remote server reported (0 = not reported)
#include <windows.h>
#include <stdio.h>
#include <wchar.h>

#define ID_DESKTOP 50111 // vncviewer/res/resource.h

static const wchar_t *want;
static HWND viewer;
static int count = -1;

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
  if (ok && !_wcsicmp(base ? base + 1 : path, want)) { viewer = hwnd; return FALSE; }
  return TRUE;
}

// The viewer answers WM_COPYDATA dwData=1 by sending WM_COPYDATA dwData=1 { int monitors } back
static LRESULT CALLBACK reply(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
  if (msg == WM_COPYDATA) {
    const COPYDATASTRUCT *cds = (const COPYDATASTRUCT *)lp;
    if (cds->dwData == 1 && cds->cbData >= sizeof(int)) count = *(const int *)cds->lpData;
    return TRUE;
  }
  return DefWindowProcW(hwnd, msg, wp, lp);
}

int wmain(int argc, wchar_t **argv) {
  if (argc < 3) return 2;
  want = argv[1];
  EnumWindows(visit, 0);
  if (!viewer) return 1;
  if (!wcscmp(argv[2], L"switch")) {
    PostMessageW(viewer, WM_SYSCOMMAND, ID_DESKTOP, 0);
    return 0;
  }
  if (!wcscmp(argv[2], L"count")) {
    WNDCLASSW wc = { .lpfnWndProc = reply, .hInstance = GetModuleHandleW(NULL), .lpszClassName = L"remacc_uvnc_reply" };
    RegisterClassW(&wc);
    HWND me = CreateWindowW(wc.lpszClassName, L"", 0, 0, 0, 0, 0, HWND_MESSAGE, NULL, wc.hInstance, NULL);
    COPYDATASTRUCT ask = { .dwData = 1 };
    DWORD_PTR res;
    if (!me || !SendMessageTimeoutW(viewer, WM_COPYDATA, (WPARAM)me, (LPARAM)&ask, SMTO_ABORTIFHUNG, 5000, &res)) return 3;
    if (count < 0) return 3;
    printf("%d\n", count);
    return 0;
  }
  return 2;
}
