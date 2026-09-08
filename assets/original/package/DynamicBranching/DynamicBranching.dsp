# Microsoft Developer Studio Project File - Name="DynamicBranching" - Package Owner=<4>
# Microsoft Developer Studio Generated Build File, Format Version 6.00
# ** DO NOT EDIT **

# TARGTYPE "Win32 (x86) Application" 0x0101

CFG=DynamicBranching - Win32 Debug
!MESSAGE This is not a valid makefile. To build this project using NMAKE,
!MESSAGE use the Export Makefile command and run
!MESSAGE 
!MESSAGE NMAKE /f "DynamicBranching.mak".
!MESSAGE 
!MESSAGE You can specify a configuration when running NMAKE
!MESSAGE by defining the macro CFG on the command line. For example:
!MESSAGE 
!MESSAGE NMAKE /f "DynamicBranching.mak" CFG="DynamicBranching - Win32 Debug"
!MESSAGE 
!MESSAGE Possible choices for configuration are:
!MESSAGE 
!MESSAGE "DynamicBranching - Win32 Release" (based on "Win32 (x86) Application")
!MESSAGE "DynamicBranching - Win32 Debug" (based on "Win32 (x86) Application")
!MESSAGE 

# Begin Project
# PROP AllowPerConfigDependencies 0
# PROP Scc_ProjName ""
# PROP Scc_LocalPath ""
CPP=cl.exe
MTL=midl.exe
RSC=rc.exe

!IF  "$(CFG)" == "DynamicBranching - Win32 Release"

# PROP BASE Use_MFC 0
# PROP BASE Use_Debug_Libraries 0
# PROP BASE Output_Dir "Release"
# PROP BASE Intermediate_Dir "Release"
# PROP BASE Target_Dir ""
# PROP Use_MFC 0
# PROP Use_Debug_Libraries 0
# PROP Output_Dir "Release"
# PROP Intermediate_Dir "Release"
# PROP Ignore_Export_Lib 0
# PROP Target_Dir ""
# ADD BASE CPP /nologo /W3 /GX /O2 /D "WIN32" /D "NDEBUG" /D "_WINDOWS" /D "_MBCS" /YX /FD /c
# ADD CPP /nologo /W3 /GX /O1 /D "WIN32" /D "NDEBUG" /D "_WINDOWS" /D "_MBCS" /D "NO_TEX3D" /D "NO_PCX" /D "NO_JPEG" /D "NO_TGA" /D "NO_BMP" /YX /FD /c
# ADD BASE MTL /nologo /D "NDEBUG" /mktyplib203 /win32
# ADD MTL /nologo /D "NDEBUG" /mktyplib203 /win32
# ADD BASE RSC /l 0x41d /d "NDEBUG"
# ADD RSC /l 0x41d /d "NDEBUG"
BSC32=bscmake.exe
# ADD BASE BSC32 /nologo
# ADD BSC32 /nologo
LINK32=link.exe
# ADD BASE LINK32 kernel32.lib user32.lib gdi32.lib winspool.lib comdlg32.lib advapi32.lib shell32.lib ole32.lib oleaut32.lib uuid.lib odbc32.lib odbccp32.lib /nologo /subsystem:windows /machine:I386
# ADD LINK32 kernel32.lib user32.lib gdi32.lib winspool.lib comdlg32.lib advapi32.lib shell32.lib ole32.lib oleaut32.lib uuid.lib odbc32.lib odbccp32.lib /nologo /subsystem:windows /machine:I386 /out:"DynamicBranching.exe"

!ELSEIF  "$(CFG)" == "DynamicBranching - Win32 Debug"

# PROP BASE Use_MFC 0
# PROP BASE Use_Debug_Libraries 1
# PROP BASE Output_Dir "Debug"
# PROP BASE Intermediate_Dir "Debug"
# PROP BASE Target_Dir ""
# PROP Use_MFC 0
# PROP Use_Debug_Libraries 1
# PROP Output_Dir "Debug"
# PROP Intermediate_Dir "Debug"
# PROP Ignore_Export_Lib 0
# PROP Target_Dir ""
# ADD BASE CPP /nologo /W3 /Gm /GX /ZI /Od /D "WIN32" /D "_DEBUG" /D "_WINDOWS" /D "_MBCS" /YX /FD /GZ /c
# ADD CPP /nologo /W3 /Gm /GX /ZI /Od /D "WIN32" /D "_DEBUG" /D "_WINDOWS" /D "_MBCS" /D "NO_TEX3D" /YX /FD /GZ /c
# ADD BASE MTL /nologo /D "_DEBUG" /mktyplib203 /win32
# ADD MTL /nologo /D "_DEBUG" /mktyplib203 /win32
# ADD BASE RSC /l 0x41d /d "_DEBUG"
# ADD RSC /l 0x41d /d "_DEBUG"
BSC32=bscmake.exe
# ADD BASE BSC32 /nologo
# ADD BSC32 /nologo
LINK32=link.exe
# ADD BASE LINK32 kernel32.lib user32.lib gdi32.lib winspool.lib comdlg32.lib advapi32.lib shell32.lib ole32.lib oleaut32.lib uuid.lib odbc32.lib odbccp32.lib /nologo /subsystem:windows /debug /machine:I386 /pdbtype:sept
# ADD LINK32 kernel32.lib user32.lib gdi32.lib winspool.lib comdlg32.lib advapi32.lib shell32.lib ole32.lib oleaut32.lib uuid.lib odbc32.lib odbccp32.lib /nologo /subsystem:windows /debug /machine:I386 /nodefaultlib:"libc" /out:"DynamicBranching.exe" /pdbtype:sept
# SUBTRACT LINK32 /pdb:none

!ENDIF 

# Begin Target

# Name "DynamicBranching - Win32 Release"
# Name "DynamicBranching - Win32 Debug"
# Begin Group "Source Files"

# PROP Default_Filter "cpp;c;cxx;rc;def;r;odl;idl;hpj;bat"
# Begin Source File

SOURCE=..\Framework2\App.cpp
# End Source File
# Begin Source File

SOURCE=..\Framework2\Util\Config.cpp
# End Source File
# Begin Source File

SOURCE=..\Framework2\CPU.cpp
# End Source File
# Begin Source File

SOURCE=..\Framework2\Direct3D\Direct3DApp.cpp
# End Source File
# Begin Source File

SOURCE=..\Framework2\Util\Direct3DModel.cpp
# End Source File
# Begin Source File

SOURCE=..\Framework2\Direct3D\Direct3DRenderer.cpp
# End Source File
# Begin Source File

SOURCE=..\Framework2\DisplayMode.cpp
# End Source File
# Begin Source File

SOURCE=..\Framework2\Util\Font.cpp
# End Source File
# Begin Source File

SOURCE=..\Framework2\Globals.cpp
# End Source File
# Begin Source File

SOURCE=..\Framework2\Imaging\Image.cpp
# End Source File
# Begin Source File

SOURCE=.\Main.cpp
# End Source File
# Begin Source File

SOURCE=..\Framework2\Menu.cpp
# End Source File
# Begin Source File

SOURCE=..\Framework2\Util\Model.cpp
# End Source File
# Begin Source File

SOURCE=..\Framework2\Renderer.cpp
# End Source File
# Begin Source File

SOURCE=..\Framework2\Util\String.cpp
# End Source File
# Begin Source File

SOURCE=..\Framework2\Util\Tokenizer.cpp
# End Source File
# Begin Source File

SOURCE=..\Framework2\Math\Vector.cpp
# End Source File
# Begin Source File

SOURCE=..\Framework2\Windows\WindowsBase.cpp
# End Source File
# End Group
# Begin Group "Header Files"

# PROP Default_Filter "h;hpp;hxx;hm;inl"
# Begin Source File

SOURCE=..\Framework2\App.h
# End Source File
# Begin Source File

SOURCE=..\Framework2\Util\Config.h
# End Source File
# Begin Source File

SOURCE=..\Framework2\CPU.h
# End Source File
# Begin Source File

SOURCE=..\Framework2\Direct3D\Direct3DApp.h
# End Source File
# Begin Source File

SOURCE=..\Framework2\Util\Direct3DModel.h
# End Source File
# Begin Source File

SOURCE=..\Framework2\Direct3D\Direct3DRenderer.h
# End Source File
# Begin Source File

SOURCE=..\Framework2\DisplayMode.h
# End Source File
# Begin Source File

SOURCE=..\Framework2\Util\Font.h
# End Source File
# Begin Source File

SOURCE=..\Framework2\Globals.h
# End Source File
# Begin Source File

SOURCE=..\Framework2\Imaging\Image.h
# End Source File
# Begin Source File

SOURCE=..\Framework2\Menu.h
# End Source File
# Begin Source File

SOURCE=..\Framework2\Util\Model.h
# End Source File
# Begin Source File

SOURCE=..\Framework2\Renderer.h
# End Source File
# Begin Source File

SOURCE=..\Framework2\Util\String.h
# End Source File
# Begin Source File

SOURCE=..\Framework2\Util\Tokenizer.h
# End Source File
# Begin Source File

SOURCE=..\Framework2\Math\Vector.h
# End Source File
# End Group
# Begin Group "Resource Files"

# PROP Default_Filter "ico;cur;bmp;dlg;rc2;rct;bin;rgs;gif;jpg;jpeg;jpe"
# Begin Source File

SOURCE=..\Framework2\Windows\Resources.rc
# End Source File
# End Group
# Begin Source File

SOURCE=.\depthAmbient.shd
# End Source File
# Begin Source File

SOURCE=.\if.shd
# End Source File
# Begin Source File

SOURCE=.\lighting.shd
# End Source File
# End Target
# End Project
