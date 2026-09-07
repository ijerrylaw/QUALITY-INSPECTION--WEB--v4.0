nssm.exe in this folder - what it is and where it came from
==========================================================

WHAT
  NSSM, "the Non-Sucking Service Manager" - a small, public-domain tool that
  runs an ordinary program as a Windows service (auto-start on boot, restart
  on crash). install.ps1 uses it to register the Quality Inspection service.
  Project home: https://nssm.cc/   Licence: public domain.

WHICH BUILD
  NSSM 2.24-101-g897c7ad, 64-bit, dated 2017-04-26.

  This is the pre-release build that nssm.cc's own download page recommends for
  "Windows 10 Creators Update or newer" (which includes every Windows Server
  and Windows client this application is deployed on). The last tagged stable
  release, 2.24, is from 2014 and has known service-startup failures on modern
  Windows, so it is deliberately NOT the one bundled here. 2.24-101-g897c7ad is
  also the build shipped by the Chocolatey `nssm` package, which is how its
  SHA256 below can be cross-checked against an independent, long-standing
  source.

HOW IT WAS VERIFIED BEFORE BEING ADDED TO THIS REPOSITORY
  nssm.cc does not publish SHA256 sums or code signatures. It publishes a SHA1
  of each download on the download page, and NSSM binaries are not Authenticode
  signed. Verification was therefore by cross-checking two independent sources
  against a fresh download:

    Source zip : https://nssm.cc/ci/nssm-2.24-101-g897c7ad.zip
      SHA1     : ca2f6782a05af85facf9b620e047b01271edd11d
                 -> matches the hash published on nssm.cc/download
      SHA256   : 99f5045fffbffb745d67fe3a065a953c4a3d9c253b868892d9b685b0ee7d07b8
                 -> matches the checksum64 published by the Chocolatey `nssm`
                    package (moderator-reviewed, stable for years)

    Extracted win64/nssm.exe
      SHA256   : eee9c44c29c2be011f1f1e43bb8c3fca888cb81053022ec5a0060035de16d848
      Size     : 368640 bytes
      PE       : PE32+ (x86-64) console executable
      Version  : CompanyName "Iain Patterson", ProductName "NSSM 64-bit",
                 FileVersion "2.24-101-g897c7ad",
                 "Public Domain; Author Iain Patterson 2003-2017"

  install.ps1 re-computes the SHA256 of this file at install time and refuses to
  execute it if it does not match eee9c44c...; package.ps1 pins the same value
  so a corrupted or swapped copy fails the package build.

TO USE A DIFFERENT nssm.exe
  Run the installer with:  .\install.ps1 -NssmPath "C:\path\to\your\nssm.exe"
  An explicit -NssmPath overrides this bundled copy entirely.
