===============================================================================
 QUALITY INSPECTION (WEB) v4.0
 Server installation guide
===============================================================================

This folder installs the Quality Inspection application onto a Windows server.
Once installed it runs as a Windows service: it starts by itself when the
server boots, and restarts by itself if it ever stops unexpectedly.

You do not need to be a developer to follow this. Work through it in order.


-------------------------------------------------------------------------------
 BEFORE YOU START - three things must already be in place
-------------------------------------------------------------------------------

 1. NODE.JS, version 20.19 or newer (version 22 LTS is recommended).
    Download from https://nodejs.org and install it. Accept the option that
    adds Node.js to the system PATH.

 2. NSSM, the service wrapper.
    Download from https://nssm.cc/download and unzip it. The file you need is
    nssm.exe inside the win64 folder. Either copy it into a folder already on
    the PATH, or just note where you put it - the installer accepts the path
    directly.

 3. A TLS CERTIFICATE AND PRIVATE KEY, in PEM format, from the company
    certificate authority. Request these from IT.

    The installer does NOT create a certificate, and this is deliberate. A
    self-signed certificate would make every browser display a security
    warning, and Microsoft Entra ID sign-in would not work at all.

    When requesting it, tell IT:
      - the certificate must cover every hostname and IP address staff will
        use to reach this server;
      - it must be supplied in PEM format, as two files: the certificate and
        the private key;
      - the issuing certificate authority must be trusted on the PCs and
        tablets that will open the application.

 The server also needs outbound internet access, so the installer can download
 the application's dependencies.


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

          If nssm.exe is not on the PATH, point at it instead:

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
              Full paths to the private key and certificate files IT gave you.

            WIPE_ENDPOINT_PASSWORD
              A password you choose. It protects the maintenance function that
              erases inspection data. Store it with the site's other
              credentials.

          HOST, PORT and NODE_ENV are already filled in with working defaults.
          Leave them alone unless you have a reason to change them.

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
 IF SOMETHING GOES WRONG
-------------------------------------------------------------------------------

 The installer stops at the first problem and prints a WHAT TO DO section
 naming the exact fix. The most common causes are:

   "NSSM was not found"
     nssm.exe is not on the PATH. Re-run with -NssmPath pointing at it.

   "The TLS certificate files were not found"
     TLS_KEY_PATH or TLS_CERT_PATH in backend\.env does not match where the
     files actually are. Check for typos and confirm both files exist.

   "The configuration file is incomplete"
     One or more CHANGE_ME placeholders are still in backend\.env. The message
     lists exactly which ones.

   "The service did not start"
     Almost always an unreadable certificate or key file, or another program
     already using the port. The message includes the last lines of the error
     log.

 It is always safe to run .\install.ps1 again. Every step checks the current
 state first, and your data and configuration are never overwritten.
