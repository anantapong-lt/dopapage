#define MyAppName "Dopapage"
#define MyAppPublisher "Dopapage"
#define MyAppExeName "Dopapage.exe"
#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif

[Setup]
AppId={{DB1E2025-86D0-4AB3-AD07-450EF1FA91C4}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\Dopapage
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\dist\installer
; Keep the public installer URL stable across application releases.
OutputBaseFilename=Dopapage-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Files]
; The GPU runtime is downloaded by the bootstrap on first launch.
Source: "..\dist\bootstrap\Dopapage\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Registry]
; QSettings uses the native per-user registry backend on Windows.
Root: HKCU; Subkey: "Software\Dopapage\TTS Agent"; Flags: uninsdeletekey

[UninstallRun]
; Remove the credentials written by keyring to Windows Credential Manager.
; The service target can hold the most recently saved account, while the
; compound targets hold the refresh token and earlier saved login details.
Filename: "{cmd}"; Parameters: "/C cmdkey /delete:""Readji TTS Agent"" >nul 2>&1"; Flags: runhidden
Filename: "{cmd}"; Parameters: "/C cmdkey /delete:""refresh-token@Readji TTS Agent"" >nul 2>&1"; Flags: runhidden
Filename: "{cmd}"; Parameters: "/C cmdkey /delete:""login:http://185.84.161.98:4000@Readji TTS Agent"" >nul 2>&1"; Flags: runhidden
Filename: "{cmd}"; Parameters: "/C cmdkey /delete:""login:http://localhost:4000@Readji TTS Agent"" >nul 2>&1"; Flags: runhidden

[UninstallDelete]
; Delete all per-user data that is downloaded or generated after installation.
Type: filesandordirs; Name: "{localappdata}\Readji\TTS Agent"
Type: filesandordirs; Name: "{app}"
