===============================================================================
 QUALITY INSPECTION (WEB) v4.0
 Server installation guide
===============================================================================

This folder installs the Quality Inspection application onto a Windows server.
Once installed it runs as a Windows service: it starts by itself when the
server boots, and restarts by itself if it ever stops unexpectedly.

You do not need to be a developer to follow this. Work through it in order.


-------------------------------------------------------------------------------
 BEFORE YOU START - one thing must already be in place
-------------------------------------------------------------------------------

 1. NODE.JS, version 20.19 or newer (version 22 LTS is recommended).
    Download from https://nodejs.org and install it. Accept the option that
    adds Node.js to the system PATH.

 The server also needs outbound internet access, so the installer can download
 the application's dependencies.

 NSSM (the tool that runs the app as a Windows service) is NOT something you
 need to download. A copy ships inside this package at install\tools\nssm.exe;
 the installer checks it against a known SHA256 and uses it automatically. To
 run a different version of NSSM instead, pass its path:
 .\install.ps1 -NssmPath "C:\path\to\nssm.exe"  (see install\tools\README-nssm.txt).


-------------------------------------------------------------------------------
 ABOUT THE TLS CERTIFICATE - USUALLY NOTHING TO DO
-------------------------------------------------------------------------------

 You do NOT need to obtain a certificate. If none is present when the installer
 runs, it generates a self-signed certificate for this server automatically,
 issued to the server's hostname and IP address and valid for 5 years.

 A self-signed certificate is fully functional and the connection is
 encrypted, but each browser shows a one-time "Not secure" warning the first
 time it opens the app - staff click Advanced, then Continue. See the section
 "THE BROWSER SECURITY WARNING" further down.

 Two optional things you can do:

   - If the server has a FIXED IP that staff will type into their browsers,
     set HOST to that IP in backend\.env (STEP 5) so the certificate is issued
     to exactly that address.

   - If your organisation runs its own certificate authority and you would
     rather use a certificate from it, put the PEM certificate and private key
     files in place BEFORE running the installer, at the paths you set for
     TLS_CERT_PATH / TLS_KEY_PATH. Existing files are used untouched - the
     installer never overwrites a certificate it finds.


-------------------------------------------------------------------------------
 INSTALLATION
-------------------------------------------------------------------------------

 STEP 1 - Copy this package folder onto the server.
          C:\Apps\QualityInspection is a good choice. Avoid folder names with
          unusual characters.

 STEP 2 - Open PowerShell AS ADMINISTRATOR.
          Right-click the Windows PowerShell entry in the Start menu and choose
          "Run as administrator". This is required to register a service.

 STEP 3 - Change to the folder you copied, for example:

            cd C:\Apps\QualityInspection

 STEP 4 - Run the installer:

            .\install.ps1

          Nothing extra is needed - NSSM ships in the package. Only if you want
          the installer to use your own copy of nssm.exe:

            .\install.ps1 -NssmPath "C:\Tools\nssm\win64\nssm.exe"

          If Windows blocks the script, allow it for this window only:

            Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

 STEP 5 - THE FIRST RUN STOPS ON PURPOSE.

          It creates a configuration file and then stops, so you can fill in
          this site's real values. The file is:

            backend\.env

          Open it in Notepad. At the bottom is a section marked REQUIRED.
          Replace every CHANGE_ME:

            DATABASE_URL
              Where inspection data is stored. Must be an absolute path,
              written with a file: prefix. Put it OUTSIDE this application
              folder so that updating the application can never touch it.
              Suggested:
                DATABASE_URL=file:C:\ProgramData\QualityInspection\prod.db

            TLS_KEY_PATH
            TLS_CERT_PATH
              Where the installer should place the TLS private key and
              certificate, e.g. C:\ProgramData\QualityInspection\certs\ . If
              you have no certificate of your own, just give two writable
              paths and the installer generates a self-signed pair there. If
              you DO have your own PEM files, copy them to these paths first.

            WIPE_ENDPOINT_PASSWORD
              A password you choose. It protects the maintenance function that
              erases inspection data. Store it with the site's other
              credentials.

          PORT and NODE_ENV are already filled in with working defaults; leave
          them alone unless you have a reason to change them. HOST defaults to
          0.0.0.0 (all network interfaces), which is fine - but if the server
          has a fixed IP that staff will type into their browsers, set HOST to
          that exact IP so the auto-generated certificate matches it.

 STEP 6 - Run the installer again:

            .\install.ps1

          This time it completes: it installs dependencies, builds the web
          interface, registers the service, starts it, and confirms the
          application answers. Each step reports OK or FAIL as it goes.

 STEP 7 - Give IT the address the installer prints at the end, for example:

            https://YOURSERVER:4009

          That exact address must be added as a Redirect URI in the Entra ID
          App Registration. UNTIL THAT IS DONE, MICROSOFT SIGN-IN WILL FAIL
          with a redirect-URI-mismatch error, even though the application
          itself is running correctly.

          If you need to confirm the exact value later, sign in and look under
          System > Environment > Redirect URI. The app shows the precise string
          it sends to Microsoft.


-------------------------------------------------------------------------------
 EVERYDAY MANAGEMENT
-------------------------------------------------------------------------------

 Check it is running     nssm status QualityInspection
 Restart it              nssm restart QualityInspection
 Stop it                 nssm stop QualityInspection
 Start it                nssm start QualityInspection

 Application logs are in the logs folder inside the application directory:
   service.out.log    normal output
   service.err.log    errors - look here first if something is wrong

 The service is also visible in the standard Windows Services console
 (services.msc) under the name "Quality Inspection (Web) v4.0".


-------------------------------------------------------------------------------
 BACKUPS - IMPORTANT
-------------------------------------------------------------------------------

 ALL inspection data lives in the single database file that DATABASE_URL points
 at. If you used the suggested value, that is:

   C:\ProgramData\QualityInspection\prod.db

 Add that file to the server's backup job. Nothing else in this installation is
 irreplaceable - the application itself can always be installed again from this
 package, but the database cannot.


-------------------------------------------------------------------------------
 UPDATING TO A NEWER VERSION
-------------------------------------------------------------------------------

 1. Stop the service:              nssm stop QualityInspection
 2. Back up the database file.
 3. Copy the new package over the application folder, keeping backend\.env.
 4. Run .\install.ps1 again from an administrator PowerShell window.

 The installer detects the existing database and leaves it completely
 untouched. It only ever installs the starter database when no database file
 exists yet.


-------------------------------------------------------------------------------
 THE BROWSER SECURITY WARNING
-------------------------------------------------------------------------------

 If the installer generated a self-signed certificate, every browser shows a
 "Your connection is not private" / "Not secure" warning the FIRST time it
 opens the app. This is expected for a self-signed certificate.

   - Click Advanced, then Continue / Proceed to the site.
   - The browser remembers the choice for that machine.
   - The connection is still encrypted the whole time.

 To remove the warning for everyone, ask IT to distribute the certificate file
 (the file at TLS_CERT_PATH) to staff machines' "Trusted Root Certification
 Authorities" store, for example via Group Policy.


-------------------------------------------------------------------------------
 IF SOMETHING GOES WRONG
-------------------------------------------------------------------------------

 The installer stops at the first problem and prints a WHAT TO DO section
 naming the exact fix. The most common causes are:

   "NSSM is not available"
     The bundled install\tools\nssm.exe is missing or failed its checksum, and
     no nssm.exe was found on PATH. Re-copy the complete package to the server
     (the bundled file may not have transferred), or re-run with -NssmPath
     pointing at a copy you downloaded from https://nssm.cc/download .

   "Could not generate a self-signed certificate"
     Rare. Needs .NET Framework 4.7.2 or newer (standard on Windows Server
     2019+ and Windows 10 1809+ / Windows 11). The message explains the
     fallback: create a PEM certificate and key by hand, place them at the
     configured paths, and re-run.

   "The configuration file is incomplete"
     One or more CHANGE_ME placeholders are still in backend\.env. The message
     lists exactly which ones.

   "The service did not start"
     Almost always an unreadable certificate or key file, or another program
     already using the port. The message includes the last lines of the error
     log.

 It is always safe to run .\install.ps1 again. Every step checks the current
 state first, and your data and configuration are never overwritten.
