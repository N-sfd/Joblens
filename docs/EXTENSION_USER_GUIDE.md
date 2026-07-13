# JobLens Greenhouse Extension — User Guide

Pilot for the controlled internal pilot (v0.4.0). Screenshots should use sanitized fixtures only — never real applicant data.

## Install

1. Build the production package: `cd browser-extension && npm run package:production`
2. Open Chrome → Extensions → Developer mode → Load unpacked → select `browser-extension/dist`  
   (or install from the versioned ZIP after review)
3. Pin JobLens Application Assist

## Connect JobLens

1. Open the popup → complete onboarding acknowledgments
2. Click **Connect to JobLens** and approve in the browser
3. Return to the extension when it finishes connecting

## Open a supported Greenhouse job

Supported hosts:

- `https://boards.greenhouse.io/...`
- `https://job-boards.greenhouse.io/...`

## Analyze a form

1. Open the apply form
2. Click **Analyze Application Form** and confirm consent
3. Review supported / sensitive / unsupported counts

## Review mappings and fill

1. Choose **Assist with fill**
2. Review proposed field mappings (values masked where appropriate)
3. Select fields → confirm sensitive ones individually
4. Fill selected fields
5. Use **Undo** if needed

JobLens does **not** click Submit.

## Upload resume / cover letter

1. Select a saved document in JobLens
2. Approve the upload for the visible employer file field
3. Confirm the file appeared on the form
4. If automatic assign fails, download and upload manually

## Complete unsupported questions

Answer custom, sensitive, and legal questions yourself on the employer form.

## Review and submit

1. Review every field on the employer page
2. Click the employer **Submit** button yourself
3. In the extension, open **I Submitted**, check the confirmation box, optionally add confirmation number/URL
4. Confirm — Application Status becomes Applied and one follow-up reminder is created

## Disconnect / troubleshoot

- **Disconnect** in Privacy or home clears tokens
- Reconnect if you see “Session expired”
- Use **Report an issue** for detection/mapping/upload problems (no answer content attached)
- Unsupported page? Use Supported sites list or report the URL

## What JobLens will never do

- Silent submission or automatic Submit clicks
- CAPTCHA bypass
- Store employer credentials
- Assist on non-Greenhouse sites in this pilot
