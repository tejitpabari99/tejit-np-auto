/**
 * Serves the HTML frontend.
 */
function doGet(e) {
  try {
    console.log("Code.gs: DoGet started");
    return HtmlService.createTemplateFromFile('index')
        .evaluate()
        .setTitle('NGO Mailer Dashboard')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (error) {
    console.error(`Code.gs: CRITICAL ERROR in doGet - ${error.message}`);
    console.error(`Code.gs: Stack trace - ${error.stack}`);
    // Return error page instead of breaking
    return HtmlService.createHtmlOutput(`
      <h1>Error Loading Application</h1>
      <p>We encountered an error while loading the application. Please try refreshing the page.</p>
      <p><strong>Error:</strong> ${escapeHtml_(error.message)}</p>
      <p>If this problem persists, please contact support with this error message.</p>
    `);
  }
}

/**
 * Escapes text for safe insertion into HTML.
 */
function escapeHtml_(str) {
  return String(str === null || str === undefined ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Fetches recent Google Sheets from the user's Drive.
 */
function getRecentSheets() {
  try {
    console.log("Code.gs: Fetch recent sheets started");

    const files = DriveApp.searchFiles('mimeType = "application/vnd.google-apps.spreadsheet" and trashed = false');
    const sheets = [];
    let count = 0;

    // Limit to first 50 sheets for performance
    while (files.hasNext() && count < 50) {
      try {
        const file = files.next();
        sheets.push({name: file.getName(), id: file.getId()});
        count++;
      } catch (fileError) {
        console.error(`Code.gs: Error accessing file ${count + 1} - ${fileError.message}`);
        // Continue to next file instead of breaking
        continue;
      }
    }

    console.log(`Code.gs: Successfully fetched ${count} sheets`);

    if (count === 0) {
      console.warn("Code.gs: No spreadsheets found in user's Drive");
    }

    return sheets;
  } catch (error) {
    console.error(`Code.gs: ERROR in getRecentSheets - ${error.message}`);
    console.error(`Code.gs: Stack trace - ${error.stack}`);
    throw new Error(`Failed to fetch spreadsheets: ${error.message}. Please ensure you have granted Drive permissions.`);
  }
}

/**
 * Fetches Gmail drafts
 */
function getGmailDrafts() {
  try {
    console.log("Code.gs: Fetching Gmail drafts started");

    const drafts = GmailApp.getDrafts();
    console.log(`Code.gs: Total drafts found - ${drafts.length}`);

    if (drafts.length === 0) {
      console.warn("Code.gs: No Gmail drafts found");
      return [];
    }

    const draftsList = [];
    drafts.forEach((draft, index) => {
      try {
        const message = draft.getMessage();
        draftsList.push({
          subject: message.getSubject() || '(No Subject)',
          id: draft.getId()
        });
      } catch (draftError) {
        console.error(`Code.gs: Error accessing draft ${index + 1} - ${draftError.message}`);
        // Continue to next draft instead of breaking
      }
    });

    console.log(`Code.gs: Successfully processed ${draftsList.length} drafts`);
    return draftsList;
  } catch (error) {
    console.error(`Code.gs: ERROR in getGmailDrafts - ${error.message}`);
    console.error(`Code.gs: Stack trace - ${error.stack}`);
    throw new Error(`Failed to fetch Gmail drafts: ${error.message}. Please ensure you have granted Gmail permissions.`);
  }
}

/**
 * Lists all tabs (sheets) inside a spreadsheet.
 * @return {Array<{name: string, index: number}>}
 */
function getSheetTabs(sheetId) {
  try {
    if (!sheetId || sheetId.trim() === '') {
      throw new Error("Sheet ID is required");
    }
    const spreadsheet = SpreadsheetApp.openById(sheetId);
    const tabs = spreadsheet.getSheets().map((s, i) => ({ name: s.getName(), index: i }));
    console.log(`Code.gs: Found ${tabs.length} tabs`);
    return tabs;
  } catch (error) {
    console.error(`Code.gs: ERROR in getSheetTabs - ${error.message}`);
    if (error.message.includes('perhaps it was deleted')) {
      throw new Error(`Spreadsheet not found. The file may have been deleted or you may not have permission to access it.`);
    }
    throw new Error(`Failed to get tabs: ${error.message}`);
  }
}

/**
 * Returns the named tab, or the first tab when sheetName is empty/undefined.
 */
function getTargetSheet_(spreadsheet, sheetName) {
  const sheets = spreadsheet.getSheets();
  if (!sheets || sheets.length === 0) {
    throw new Error("The spreadsheet contains no sheets");
  }
  if (!sheetName || String(sheetName).trim() === '') {
    return sheets[0];
  }
  const found = sheets.find(s => s.getName() === sheetName);
  if (!found) {
    throw new Error(`Tab "${sheetName}" not found in this spreadsheet.`);
  }
  return found;
}

/**
 * Get preview data (first 5 rows) from a spreadsheet tab
 */
function getPreviewData(sheetId, sheetName) {
  console.log(`Code.gs: Getting preview data for sheet ${sheetId}`);

  try {
    if (!sheetId || sheetId.trim() === '') {
      console.error("Code.gs: Empty sheet ID provided");
      throw new Error("Sheet ID is required");
    }

    console.log(`Code.gs: Opening spreadsheet with ID: ${sheetId}`);
    const spreadsheet = SpreadsheetApp.openById(sheetId);
    console.log("Code.gs: Spreadsheet opened");

    const sheet = getTargetSheet_(spreadsheet, sheetName);
    console.log("Code.gs: Tab selected");

    const data = sheet.getDataRange().getDisplayValues();
    console.log(`Code.gs: Total rows in sheet: ${data.length}`);

    if (data.length === 0) {
      console.error("Code.gs: Sheet is completely empty");
      throw new Error("No data found in spreadsheet - the sheet appears to be empty");
    }

    if (data.length === 1) {
      console.error("Code.gs: Only header row found, no data rows");
      throw new Error("No data rows found in spreadsheet - only headers are present. Please add data rows.");
    }

    const headers = data[0];
    // Get up to 5 data rows (excluding header)
    const rows = data.slice(1, Math.min(6, data.length));

    console.log(`Code.gs: Preview data fetched successfully - ${rows.length} rows, ${headers.length} columns`);

    return {
      headers: headers,
      rows: rows
    };
  } catch (error) {
    console.error(`Code.gs: ERROR in getPreviewData - ${error.message}`);
    console.error(`Code.gs: Stack trace - ${error.stack}`);

    // Provide more specific error messages based on error type
    if (error.message.includes('perhaps it was deleted')) {
      throw new Error(`Spreadsheet not found. The file may have been deleted or you may not have permission to access it.`);
    } else if (error.message.includes('permission')) {
      throw new Error(`Permission denied. Please ensure you have access to this spreadsheet.`);
    } else {
      throw new Error(`Failed to get preview data: ${error.message}`);
    }
  }
}

/**
 * Extract variables from template text (handles HTML tags inside braces)
 */
function extractVariables(text) {
  try {
    console.log("Code.gs: Extracting variables from template");

    if (!text || typeof text !== 'string') {
      console.warn("Code.gs: Invalid text provided for variable extraction");
      return [];
    }

    const variablePattern = /\{\{([\s\S]+?)\}\}/g;
    const variables = [];
    let match;

    while ((match = variablePattern.exec(text)) !== null) {
      // Strip HTML tags from the match to get the clean variable name
      const varName = match[1].replace(/<[^>]+>/g, '').trim();
      if (varName && !variables.includes(varName)) {
        variables.push(varName);
      }
    }

    console.log(`Code.gs: Found ${variables.length} unique variables: ${variables.join(', ')}`);
    return variables;
  } catch (error) {
    console.error(`Code.gs: ERROR in extractVariables - ${error.message}`);
    console.error(`Code.gs: Stack trace - ${error.stack}`);
    // Return empty array instead of breaking
    return [];
  }
}

/**
 * Map variable names to their column indices in the spreadsheet
 */
function mapVariablesToColumns(headers, variables) {
  try {
    console.log(`Code.gs: Mapping ${variables.length} variables to columns`);

    if (!headers || !Array.isArray(headers)) {
      console.error("Code.gs: Invalid headers provided");
      throw new Error("Invalid spreadsheet headers");
    }

    if (!variables || !Array.isArray(variables)) {
      console.error("Code.gs: Invalid variables provided");
      return {};
    }

    const variableColumnMap = {};
    const unmappedVariables = [];

    variables.forEach(varName => {
      try {
        const colIndex = findColumnIndex(headers, varName);
        variableColumnMap[varName] = colIndex - 1; // Convert to 0-based for array access
        console.log(`Code.gs: Variable "${varName}" mapped to column index ${colIndex}`);
      } catch (error) {
        console.warn(`Code.gs: Variable "${varName}" not found in spreadsheet headers`);
        variableColumnMap[varName] = -1; // Mark as not found
        unmappedVariables.push(varName);
      }
    });

    if (unmappedVariables.length > 0) {
      console.warn(`Code.gs: ${unmappedVariables.length} variables not found in headers: ${unmappedVariables.join(', ')}`);
    }

    console.log(`Code.gs: Variable mapping completed - ${Object.keys(variableColumnMap).length} variables mapped`);
    return variableColumnMap;
  } catch (error) {
    console.error(`Code.gs: ERROR in mapVariablesToColumns - ${error.message}`);
    console.error(`Code.gs: Stack trace - ${error.stack}`);
    throw new Error(`Failed to map variables to columns: ${error.message}`);
  }
}

/**
 * Get a Gmail draft message by matching the subject line.
 * Adapted from Google's Mail Merge script to properly handle attachments and inline images.
 * @param {string} subject_line to search for draft message
 * @return {object} containing the subject, plain and html message body and attachments
 */
function getGmailTemplateFromDrafts_(subject_line) {
  console.log("Code.gs: Getting Gmail template from draft");

  try {
    if (!subject_line || subject_line.trim() === '') {
      console.error("Code.gs: Empty subject line provided");
      throw new Error("Draft subject is required");
    }

    // get drafts
    console.log("Code.gs: Fetching all drafts");
    const drafts = GmailApp.getDrafts();
    console.log(`Code.gs: Total drafts available: ${drafts.length}`);

    // filter the drafts that match subject line
    const draft = drafts.filter(d => {
      try {
        return d.getMessage().getSubject() === subject_line;
      } catch (e) {
        console.warn(`Code.gs: Error checking draft subject - ${e.message}`);
        return false;
      }
    })[0];

    if (!draft) {
      console.error("Code.gs: Draft with the requested subject not found");
      throw new Error(`Draft with subject "${subject_line}" not found`);
    }

    console.log("Code.gs: Draft found");

    // get the message object
    const msg = draft.getMessage();

    // Handles inline images and attachments so they can be included in the merge
    // Based on https://stackoverflow.com/a/65813881/1027723
    // Gets all attachments and inline image attachments
    const allInlineImages = draft.getMessage().getAttachments({
      includeInlineImages: true,
      includeAttachments: false,
    });
    const attachments = draft
      .getMessage()
      .getAttachments({ includeInlineImages: false });
    const htmlBody = msg.getBody();

    // Creates an inline image object with the image name as key
    // (can't rely on image index as array based on insert order)
    const img_obj = allInlineImages.reduce((obj, i) => {
      obj[i.getName()] = i;
      return obj;
    }, {});

    //Regexp searches for all img string positions with cid
    const imgexp = /<img.*?src="cid:(.*?)".*?alt="(.*?)"[^\>]+>/g;
    const matches = [...htmlBody.matchAll(imgexp)];

    //Initiates the allInlineImages object
    const inlineImagesObj = {};
    for (const match of matches) {
      inlineImagesObj[match[1]] = img_obj[match[2]];
    }

    console.log(`Code.gs: Template extracted - attachments: ${attachments.length}, inline images: ${Object.keys(inlineImagesObj).length}`);

    return {
      message: {
        subject: subject_line,
        text: msg.getPlainBody(),
        html: htmlBody,
      },
      attachments: attachments,
      inlineImages: inlineImagesObj,
    };
  } catch (e) {
    console.error(`Code.gs: ERROR in getGmailTemplateFromDrafts_ - ${e.message}`);
    console.error(`Code.gs: Stack trace - ${e.stack}`);
    throw new Error(`Failed to get Gmail draft template: ${e.message}`);
  }
}

/**
 * Prepares email data including HTML, Attachments, and Inline Images
 */
function prepareEmailContext(sheetId, draftSubject, emailColumn, sheetName) {
  console.log(`Code.gs: Preparing email context`);
  console.log(`Code.gs: Parameters - sheetId: ${sheetId}`);

  try {
    // Validate inputs
    if (!sheetId || sheetId.trim() === '') {
      throw new Error("Sheet ID is required");
    }
    if (!draftSubject || draftSubject.trim() === '') {
      throw new Error("Draft subject is required");
    }
    if (!emailColumn || emailColumn.trim() === '') {
      throw new Error("Email column is required");
    }

    console.log("Code.gs: Opening spreadsheet");
    const spreadsheet = SpreadsheetApp.openById(sheetId);
    const sheet = getTargetSheet_(spreadsheet, sheetName);

    console.log("Code.gs: Getting spreadsheet data");
    const data = sheet.getDataRange().getDisplayValues();
    const headers = data[0];
    const rows = data.slice(1);

    console.log(`Code.gs: Spreadsheet data - ${rows.length} rows, ${headers.length} columns`);

    if (rows.length === 0) {
      console.error("Code.gs: No data rows found");
      throw new Error("No data rows found in spreadsheet");
    }

    // Use the Google Mail Merge function to get template with proper attachment/image handling
    console.log("Code.gs: Getting email template from Gmail draft");
    const emailTemplate = getGmailTemplateFromDrafts_(draftSubject);

    console.log("Code.gs: Extracting variables from template");
    const variablesInTemplate = extractVariables(emailTemplate.message.html);

    console.log("Code.gs: Mapping variables to columns");
    const variableColumnMap = mapVariablesToColumns(headers, variablesInTemplate);

    console.log("Code.gs: Finding email column index");
    const emailColIndex = findColumnIndex(headers, emailColumn);
    console.log(`Code.gs: Email column index: ${emailColIndex}`);

    console.log("Code.gs: Email context prepared successfully");

    return {
      rows,
      emailTemplate,
      variablesInTemplate,
      variableColumnMap,
      emailColIndex
    };
  } catch (error) {
    console.error(`Code.gs: ERROR in prepareEmailContext - ${error.message}`);
    console.error(`Code.gs: Stack trace - ${error.stack}`);
    throw new Error(`Failed to prepare email context: ${error.message}`);
  }
}

/**
 * Fill template string with data object
 * Adapted from Google's Mail Merge script
 * @see https://stackoverflow.com/a/378000/1027723
 * @param {object} template object containing subject, text, and html
 * @param {object} data object used to replace {{}} markers
 * @return {object} message replaced with data
 */
function fillInTemplateFromObject_(template, data) {
  // Subject/text get raw cell values; html gets HTML-escaped values (no injection).
  const fill = (part, transform) => {
    let template_string = JSON.stringify(part);
    template_string = template_string.replace(/{{[^{}]+}}/g, (key) => {
      return escapeData_(transform(String(data[key.replace(/[{}]+/g, "")] || "")));
    });
    return JSON.parse(template_string);
  };
  const plain = fill({ subject: template.subject, text: template.text }, (v) => v);
  const htmlPart = fill({ html: template.html }, escapeHtmlValue_);
  return Object.assign({}, template, plain, { html: htmlPart.html });
}

/**
 * HTML-escape a cell value for the html body and turn newlines into <br>
 */
function escapeHtmlValue_(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\r\n|\r|\n/g, "<br>");
}

/**
 * True only for exactly one plain email address (no list separators, spaces, <>)
 */
function isValidSingleEmail_(addr) {
  return /^[^\s,;<>"]+@[^\s,;<>"]+\.[^\s,;<>"]+$/.test(String(addr || '').trim());
}

/**
 * Escape cell data to make JSON safe
 * From Google's Mail Merge script
 * @see https://stackoverflow.com/a/9204218/1027723
 * @param {string} str to escape JSON special characters from
 * @return {string} escaped string
 */
function escapeData_(str) {
  return str
    .replace(/[\\]/g, "\\\\")
    .replace(/[\"]/g, '\\"')
    .replace(/[\/]/g, "\\/")
    .replace(/[\b]/g, "\\b")
    .replace(/[\f]/g, "\\f")
    .replace(/[\n]/g, "\\n")
    .replace(/[\r]/g, "\\r")
    .replace(/[\t]/g, "\\t");
}

/**
 * Generates the customized HTML and returns the full options object
 */
function processEmailRow(row, emailContext) {
  try {
    if (!row || !Array.isArray(row)) {
      throw new Error("Invalid row data");
    }

    if (!emailContext) {
      throw new Error("Email context is required");
    }

    // Create data object from row
    const rowData = {};
    emailContext.variablesInTemplate.forEach(varName => {
      const colIndex = emailContext.variableColumnMap[varName];
      rowData[varName] = (colIndex >= 0 && colIndex < row.length) ? (row[colIndex] || '') : '';
    });

    // Use Google's proven fillInTemplateFromObject_ function
    const msgObj = fillInTemplateFromObject_(emailContext.emailTemplate.message, rowData);

    const emailAddress = row[emailContext.emailColIndex - 1] || '';

    return {
      to: emailAddress,
      subject: msgObj.subject,
      text: msgObj.text,
      html: msgObj.html,
      attachments: emailContext.emailTemplate.attachments,
      inlineImages: emailContext.emailTemplate.inlineImages
    };
  } catch (error) {
    console.error(`Code.gs: ERROR in processEmailRow - ${error.message}`);
    console.error(`Code.gs: Stack trace - ${error.stack}`);
    throw new Error(`Failed to process email row: ${error.message}`);
  }
}

/**
 * Get email preview using first row of data
 */
function getEmailPreview(sheetId, draftSubject, emailColumn, sheetName) {
  console.log(`Code.gs: Getting email preview`);
  console.log(`Code.gs: Parameters - sheetId: ${sheetId}`);

  try {
    console.log("Code.gs: Preparing email context");
    const emailContext = prepareEmailContext(sheetId, draftSubject, emailColumn, sheetName);

    if (!emailContext.rows || emailContext.rows.length === 0) {
      throw new Error("No data rows available for preview");
    }

    console.log("Code.gs: Processing first row for preview");
    const emailData = processEmailRow(emailContext.rows[0], emailContext);

    console.log("Code.gs: Email preview generated successfully");

    return {
      subject: emailData.subject,
      to: emailData.to || 'recipient@example.com',
      body: emailData.html
    };
  } catch (error) {
    console.error(`Code.gs: ERROR in getEmailPreview - ${error.message}`);
    console.error(`Code.gs: Stack trace - ${error.stack}`);
    throw new Error(`Failed to generate email preview: ${error.message}`);
  }
}

/**
 * Helper function to convert column letter to index
 */
function columnLetterToIndex(letter) {
  try {
    if (!letter || typeof letter !== 'string') {
      throw new Error("Invalid column letter provided");
    }

    let column = 0;
    const length = letter.length;
    for (let i = 0; i < length; i++) {
      column += (letter.charCodeAt(i) - 64) * Math.pow(26, length - i - 1);
    }
    console.log(`Code.gs: ColumnLetterToIndex - ${letter} = ${column}`);
    return column;
  } catch (error) {
    console.error(`Code.gs: ERROR in columnLetterToIndex - ${error.message}`);
    throw new Error(`Failed to convert column letter to index: ${error.message}`);
  }
}

/**
 * Helper function to find column index by name or letter
 */
function findColumnIndex(headers, columnIdentifier) {
  try {
    console.log(`Code.gs: Finding column index for: ${columnIdentifier}`);

    if (!columnIdentifier || columnIdentifier.trim() === '') {
      throw new Error("Column identifier is required");
    }

    if (!headers || !Array.isArray(headers) || headers.length === 0) {
      throw new Error("Invalid or empty headers provided");
    }

    // 1. ALWAYS search for the column name first
    const index = headers.findIndex(h =>
      h.toString().toLowerCase().trim() === columnIdentifier.toLowerCase().trim()
    );

    if (index !== -1) {
      return index + 1; // Found the name!
    }

    // 2. ONLY if name isn't found, try interpreting as a letter (e.g., "A")
    if (/^[A-Za-z]+$/.test(columnIdentifier)) {
      return columnLetterToIndex(columnIdentifier.toUpperCase());
    }

    throw new Error(`Column "${columnIdentifier}" not found.`);
  }
  catch (error) {
    console.error(`Code.gs: ERROR in findColumnIndex - ${error.message}`);
    throw new Error(`Error finding column index for "${columnIdentifier}": ${error.message}`);
  }
}

/**
 * The core logic to send emails with progress tracking and error handling.
 * @param {string} sheetId - The ID of the spreadsheet
 * @param {string} draftSubject - The subject of the Gmail draft
 * @param {string} emailColumn - The column containing email addresses
 * @param {number} startRow - The row number to start from (1-indexed, defaults to 1)
 * @param {string} sheetName - Optional tab name (defaults to the first tab)
 */
function processAndSend(sheetId, draftSubject, emailColumn, startRow = 1, sheetName) {
  console.log("Code.gs: Process and Send started");
  try {
    const spreadsheet = SpreadsheetApp.openById(sheetId);
    const sheet = getTargetSheet_(spreadsheet, sheetName);
    const emailContext = prepareEmailContext(sheetId, draftSubject, emailColumn, sheetName);

    console.log(`Code.gs: Data rows - ${emailContext.rows.length}`);
    console.log(`Code.gs: Email column index - ${emailContext.emailColIndex}`);
    console.log(`Code.gs: Variables found in template - ${emailContext.variablesInTemplate.join(', ')}`);
    console.log(`Code.gs: Starting from row - ${startRow}`);

    // Validate startRow
    if (startRow < 1 || !Number.isInteger(startRow)) {
      throw new Error(`Invalid start row: ${startRow}. Must be a positive integer.`);
    }

    if (startRow > emailContext.rows.length) {
      throw new Error(`Start row (${startRow}) exceeds total number of data rows (${emailContext.rows.length}).`);
    }

    // Get current timestamp for column names
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    const sentColumnName = `Email Sent ${timestamp}`;
    const errorColumnName = `Email Error ${timestamp}`;

    // Add timestamp columns if they don't exist
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    let sentColIndex = headers.indexOf(sentColumnName) + 1;
    let errorColIndex = headers.indexOf(errorColumnName) + 1;

    if (sentColIndex === 0) {
      // Add new columns
      const lastCol = sheet.getLastColumn();
      sentColIndex = lastCol + 1;
      errorColIndex = lastCol + 2;
      sheet.getRange(1, sentColIndex).setValue(sentColumnName);
      sheet.getRange(1, errorColIndex).setValue(errorColumnName);
    }

    let emailsSent = 0;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;

    // Start from startRow - 1 (since array is 0-indexed but user input is 1-indexed)
    const rowsToProcess = emailContext.rows.slice(startRow - 1);
    const totalToProcess = rowsToProcess.length;

    for (let index = 0; index < rowsToProcess.length; index++) {
      const row = rowsToProcess[index];
      const actualRowNumber = startRow + index;
      const sheetRowNumber = actualRowNumber + 1; // +1 for header row

      try {
        const emailData = processEmailRow(row, emailContext);

        if (!emailData.to || emailData.to.trim() === '') {
          console.log(`Code.gs: Skipping row ${sheetRowNumber} - no email address`);
          sheet.getRange(sheetRowNumber, sentColIndex).setValue(false);
          sheet.getRange(sheetRowNumber, errorColIndex).setValue("No email address");
          consecutiveErrors++;
          continue;
        }

        if (!isValidSingleEmail_(emailData.to)) {
          console.log(`Code.gs: Skipping row ${sheetRowNumber} - invalid email address`);
          sheet.getRange(sheetRowNumber, sentColIndex).setValue(false);
          sheet.getRange(sheetRowNumber, errorColIndex).setValue("Invalid email address (must be one address)");
          consecutiveErrors++;
          continue;
        }

        // Send the email
        GmailApp.sendEmail(emailData.to.trim(), emailData.subject, emailData.text, {
          htmlBody: emailData.html,
          attachments: emailData.attachments,
          inlineImages: emailData.inlineImages
        });

        // Mark as sent with timestamp
        const sentTimestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
        sheet.getRange(sheetRowNumber, sentColIndex).setValue(true);
        sheet.getRange(sheetRowNumber, errorColIndex).setValue("");

        emailsSent++;
        consecutiveErrors = 0; // Reset consecutive error counter

        SpreadsheetApp.flush(); // Ensure updates are written to sheet

        // Log progress
        console.log(`Code.gs: Sent ${emailsSent}/${totalToProcess} emails`);

        // Wait 100ms between emails
        Utilities.sleep(100);

      } catch (error) {
        consecutiveErrors++;
        const errorMsg = error.message || "Unknown error";
        console.log(`Code.gs: Error sending email to row ${sheetRowNumber}: ${errorMsg}`);

        // Mark as failed with error message
        sheet.getRange(sheetRowNumber, sentColIndex).setValue(false);
        sheet.getRange(sheetRowNumber, errorColIndex).setValue(errorMsg);
        SpreadsheetApp.flush();

        // Check if we've hit the consecutive error limit
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          throw new Error(`Stopped after ${MAX_CONSECUTIVE_ERRORS} consecutive errors. Last error: ${errorMsg}`);
        }
      }
    }

    console.log(`Code.gs: Emails sent - ${emailsSent}, totalRows ${totalToProcess}`);

    return {
      success: true,
      emailsSent: emailsSent,
      totalRows: totalToProcess
    };
  } catch (error) {
    throw new Error(`Email sending failed: ${error.message}`);
  }
}

/**
 * Send test email to current user
 */
function sendTestEmail(sheetId, draftSubject, emailColumn, sheetName) {
  console.log("Code.gs: Sending test email");
  console.log(`Code.gs: Parameters - sheetId: ${sheetId}`);

  try {
    const userEmail = Session.getActiveUser().getEmail();

    if (!userEmail || userEmail.trim() === '') {
      throw new Error("Unable to determine user email address");
    }

    console.log("Code.gs: Preparing email context for test");
    const emailContext = prepareEmailContext(sheetId, draftSubject, emailColumn, sheetName);

    // Use the first row for the test data
    console.log("Code.gs: Processing first row for test email");
    const emailData = processEmailRow(emailContext.rows[0], emailContext);

    console.log("Code.gs: Sending test email to the current user");

    // Send test email with [TEST] prefix
    GmailApp.sendEmail(userEmail, "[TEST] " + emailData.subject, emailData.text, {
      htmlBody: emailData.html,
      attachments: emailData.attachments,
      inlineImages: emailData.inlineImages
    });

    console.log("Code.gs: Test email sent successfully");

    return { success: true, sentTo: userEmail };
  } catch (error) {
    console.error(`Code.gs: ERROR in sendTestEmail - ${error.message}`);
    console.error(`Code.gs: Stack trace - ${error.stack}`);
    throw new Error(`Failed to send test email: ${error.message}`);
  }
}

/**
 * Send emails one at a time and report progress back to client
 * This allows for real-time progress updates in the UI
 */
function sendEmailBatch(sheetId, draftSubject, emailColumn, startRow = 1, limitEmails = null, storeResults = true, conditionalColumn = '', sheetName) {
  console.log("Code.gs: ==================== BATCH START ====================");
  console.log("Code.gs: Send Email Batch started");
  console.log(`Code.gs: Parameters - sheetId: ${sheetId}`);
  console.log(`Code.gs: Settings - startRow: ${startRow}, limitEmails: ${limitEmails}, storeResults: ${storeResults}`);

  try {
    const spreadsheet = SpreadsheetApp.openById(sheetId);
    const sheet = getTargetSheet_(spreadsheet, sheetName);
    const emailContext = prepareEmailContext(sheetId, draftSubject, emailColumn, sheetName);

    // Validate startRow
    console.log(`Code.gs: Validating startRow: ${startRow}`);
    if (startRow < 1 || !Number.isInteger(startRow)) {
      console.error(`Code.gs: Invalid startRow value: ${startRow}`);
      throw new Error(`Invalid start row: ${startRow}. Must be a positive integer.`);
    }

    console.log(`Code.gs: Total rows in spreadsheet: ${emailContext.rows.length}`);
    if (startRow > emailContext.rows.length) {
      console.error(`Code.gs: startRow (${startRow}) exceeds total rows (${emailContext.rows.length})`);
      throw new Error(`Start row (${startRow}) exceeds total number of data rows (${emailContext.rows.length}).`);
    }

    // Validate limitEmails if provided
    if (limitEmails !== null) {
      console.log(`Code.gs: Validating limitEmails: ${limitEmails}`);
      if (limitEmails < 1 || !Number.isInteger(limitEmails)) {
        console.error(`Code.gs: Invalid limitEmails value: ${limitEmails}`);
        throw new Error(`Invalid limit: ${limitEmails}. Must be a positive integer.`);
      }
    }

    let sentColIndex = null;
    let errorColIndex = null;
    let conditionalColIndex = null;

    // Get conditional column index if specified
    if (conditionalColumn && conditionalColumn.trim() !== '') {
      console.log("Code.gs: Getting conditional column index");
      try {
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        conditionalColIndex = findColumnIndex(headers, conditionalColumn);
        console.log(`Code.gs: Conditional column index: ${conditionalColIndex}`);
      } catch (condError) {
        console.error(`Code.gs: ERROR finding conditional column - ${condError.message}`);
        throw new Error(`Conditional column "${conditionalColumn}" not found in spreadsheet: ${condError.message}`);
      }
    }

    // Only create columns if storeResults is true AND no conditional column specified
    if (storeResults) {
      console.log("Code.gs: Creating result tracking columns");
      try {
        // Get current timestamp for column names
        const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
        const sentColumnName = `Email Sent ${timestamp}`;
        const errorColumnName = `Email Error ${timestamp}`;

        console.log(`Code.gs: Column names - Sent: "${sentColumnName}", Error: "${errorColumnName}"`);

        // Add timestamp columns if they don't exist
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        sentColIndex = headers.indexOf(sentColumnName) + 1;
        errorColIndex = headers.indexOf(errorColumnName) + 1;

        if (sentColIndex === 0) {
          // Add new columns
          const lastCol = sheet.getLastColumn();
          sentColIndex = lastCol + 1;
          errorColIndex = lastCol + 2;
          console.log(`Code.gs: Adding new columns at positions ${sentColIndex} and ${errorColIndex}`);
          sheet.getRange(1, sentColIndex).setValue(sentColumnName);
          sheet.getRange(1, errorColIndex).setValue(errorColumnName);
          SpreadsheetApp.flush();
          console.log("Code.gs: Result tracking columns created successfully");
        } else {
          console.log("Code.gs: Using existing result tracking columns");
        }
      } catch (colError) {
        console.error(`Code.gs: ERROR creating result columns - ${colError.message}`);
        console.warn("Code.gs: Continuing without result tracking columns");
        sentColIndex = null;
        errorColIndex = null;
      }
    } else {
      console.log("Code.gs: storeResults is false, skipping column creation");
    }

    // Calculate total rows to process based on conditional column
    const rowsToProcess = emailContext.rows.slice(startRow - 1);
    let eligibleRows = [];

    if (conditionalColIndex) {
      console.log(`Code.gs: Filtering rows based on conditional column (index ${conditionalColIndex})`);
      // Filter rows where conditional column is false or empty (case insensitive)
      for (let i = 0; i < rowsToProcess.length; i++) {
        const row = rowsToProcess[i];
        const conditionalValue = row[conditionalColIndex - 1]; // Convert to 0-based
        const valueStr = String(conditionalValue).trim().toLowerCase();

        // Check if value is explicitly "true" (skip these)
        if (valueStr === 'true') {
          console.log(`Code.gs: Skipping row ${startRow + i} - conditional column is TRUE`);
          continue;
        }

        // Check if value is "false", empty, or any other value (send these)
        if (valueStr === 'false' || valueStr === '') {
          eligibleRows.push({ rowData: row, originalIndex: startRow + i });
        } else {
          // Invalid value - treat as error
          console.error(`Code.gs: Invalid conditional column value at row ${startRow + i}: "${conditionalValue}"`);
          throw new Error(`Invalid conditional column value at row ${startRow + i}: "${conditionalValue}". Expected TRUE, FALSE, or empty.`);
        }
      }
      console.log(`Code.gs: ${eligibleRows.length} eligible rows found (FALSE or empty conditional values)`);
    } else {
      console.log(`Code.gs: No conditional column specified - all rows are eligible`);
      // No conditional column - all rows are eligible
      for (let i = 0; i < rowsToProcess.length; i++) {
        eligibleRows.push({ rowData: rowsToProcess[i], originalIndex: startRow + i });
      }
    }

    let totalToProcess = eligibleRows.length;
    console.log(`Code.gs: Eligible rows to process: ${totalToProcess}`);

    // Apply limit if specified (only counts eligible rows)
    if (limitEmails !== null && limitEmails < totalToProcess) {
      eligibleRows = eligibleRows.slice(0, limitEmails);
      totalToProcess = limitEmails;
      console.log(`Code.gs: Limit applied - will process ${totalToProcess} emails`);
    }

    console.log("Code.gs: Batch setup completed successfully");
    console.log(`Code.gs: Total emails to send: ${totalToProcess}`);
    console.log("Code.gs: ==================== BATCH SETUP COMPLETE ====================");

    // Return eligible row indices for processing
    const eligibleRowIndices = eligibleRows.map(item => item.originalIndex);

    return {
      totalRows: totalToProcess,
      sentColIndex: sentColIndex,
      errorColIndex: errorColIndex,
      conditionalColIndex: conditionalColIndex,
      startRow: eligibleRowIndices[0] || startRow, // First eligible row
      eligibleRowIndices: eligibleRowIndices // Array of all eligible row indices
    };

  } catch (error) {
    console.error(`Code.gs: ERROR in sendEmailBatch - ${error.message}`);
    console.error(`Code.gs: Stack trace - ${error.stack}`);
    console.log("Code.gs: ==================== BATCH SETUP FAILED ====================");
    throw new Error(`Batch setup failed: ${error.message}`);
  }
}

/**
 * Send a single email for the specified row
 */
function sendSingleEmail(sheetId, draftSubject, emailColumn, rowIndex, sentColIndex, errorColIndex, storeResults = true, conditionalColIndex = null, sheetName) {
  console.log(`Code.gs: Sending single email for row ${rowIndex}`);

  try {
    const spreadsheet = SpreadsheetApp.openById(sheetId);
    const sheet = getTargetSheet_(spreadsheet, sheetName);
    const emailContext = prepareEmailContext(sheetId, draftSubject, emailColumn, sheetName);

    const row = emailContext.rows[rowIndex - 1]; // Convert to 0-based
    const sheetRowNumber = rowIndex + 1; // +1 for header row

    console.log(`Code.gs: Processing row ${rowIndex} (sheet row ${sheetRowNumber})`);

    // Check conditional column if specified
    if (conditionalColIndex) {
      const conditionalValue = row[conditionalColIndex - 1]; // Convert to 0-based
      const valueStr = String(conditionalValue).trim().toLowerCase();

      console.log(`Code.gs: Conditional column value for row ${rowIndex}: "${conditionalValue}"`);

      // If TRUE, skip this email
      if (valueStr === 'true') {
        console.log(`Code.gs: Skipping row ${rowIndex} - conditional column is TRUE (already sent)`);
        return { success: true, skipped: true };
      }

      // If not FALSE or empty, it's an error
      if (valueStr !== 'false' && valueStr !== '') {
        const errorMsg = `Invalid conditional column value: "${conditionalValue}". Expected TRUE, FALSE, or empty.`;
        console.error(`Code.gs: ${errorMsg}`);

        if (storeResults && sentColIndex && errorColIndex) {
          try {
            sheet.getRange(sheetRowNumber, sentColIndex).setValue(false);
            sheet.getRange(sheetRowNumber, errorColIndex).setValue(errorMsg);
            SpreadsheetApp.flush();
          } catch (sheetError) {
            console.error(`Code.gs: Error updating sheet for row ${rowIndex} - ${sheetError.message}`);
          }
        }

        return { success: false, error: errorMsg };
      }
    }

    const emailData = processEmailRow(row, emailContext);

    if (!emailData.to || emailData.to.trim() === '') {
      console.warn(`Code.gs: No email address found in row ${rowIndex}`);
      if (storeResults && sentColIndex && errorColIndex) {
        try {
          sheet.getRange(sheetRowNumber, sentColIndex).setValue(false);
          sheet.getRange(sheetRowNumber, errorColIndex).setValue("No email address");
          SpreadsheetApp.flush();
        } catch (sheetError) {
          console.error(`Code.gs: Error updating sheet for row ${rowIndex} - ${sheetError.message}`);
        }
      }
      return { success: false, error: "No email address" };
    }

    if (!isValidSingleEmail_(emailData.to)) {
      console.warn(`Code.gs: Invalid email address in row ${rowIndex}`);
      if (storeResults && sentColIndex && errorColIndex) {
        try {
          sheet.getRange(sheetRowNumber, sentColIndex).setValue(false);
          sheet.getRange(sheetRowNumber, errorColIndex).setValue("Invalid email address (must be one address)");
          SpreadsheetApp.flush();
        } catch (sheetError) {
          console.error(`Code.gs: Error updating sheet for row ${rowIndex} - ${sheetError.message}`);
        }
      }
      return { success: false, error: "Invalid email address (must be one address)" };
    }

    // Send the email
    console.log(`Code.gs: Sending email for row ${rowIndex}`);

    try {
      GmailApp.sendEmail(emailData.to.trim(), emailData.subject, emailData.text, {
        htmlBody: emailData.html,
        attachments: emailData.attachments,
        inlineImages: emailData.inlineImages
      });

      console.log(`Code.gs: Email sent successfully (row ${rowIndex})`);
    } catch (sendError) {
      console.error(`Code.gs: Gmail send error for row ${rowIndex} - ${sendError.message}`);
      throw sendError; // Re-throw to be caught by outer catch
    }

    // Mark as sent - update conditional column OR status columns (not both)
    if (storeResults && sentColIndex && errorColIndex) {
      // No conditional column - use tracking columns
      try {
        console.log(`Code.gs: Updating spreadsheet - marking row ${rowIndex} as sent`);
        sheet.getRange(sheetRowNumber, sentColIndex).setValue(true);
        sheet.getRange(sheetRowNumber, errorColIndex).setValue("");
        SpreadsheetApp.flush();
        console.log(`Code.gs: Tracking columns updated for row ${rowIndex}`);
      } catch (sheetError) {
        console.error(`Code.gs: Error updating sheet for row ${rowIndex} - ${sheetError.message}`);
        // Don't fail the email send if we can't update the sheet
      }
    }

    return { success: true };

  } catch (error) {
    console.error(`Code.gs: ERROR in sendSingleEmail for row ${rowIndex} - ${error.message}`);
    console.error(`Code.gs: Stack trace - ${error.stack}`);

    if (storeResults && sentColIndex && errorColIndex) {
      try {
        const spreadsheet = SpreadsheetApp.openById(sheetId);
        const sheet = getTargetSheet_(spreadsheet, sheetName);
        const sheetRowNumber = rowIndex + 1;

        console.log(`Code.gs: Updating spreadsheet - marking row ${rowIndex} as failed`);
        // Mark as failed with error message
        sheet.getRange(sheetRowNumber, sentColIndex).setValue(false);
        sheet.getRange(sheetRowNumber, errorColIndex).setValue(error.message);
        SpreadsheetApp.flush();
      } catch (sheetError) {
        console.error(`Code.gs: Error updating error status in sheet for row ${rowIndex} - ${sheetError.message}`);
      }
    }

    return { success: false, error: error.message };
  }
}
