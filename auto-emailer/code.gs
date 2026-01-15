/**
 * Serves the HTML frontend.
 */
function doGet(e) {
  console.log("Code.gs: DoGet started");
  return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('NGO Mailer Dashboard')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Fetches recent Google Sheets from the user's Drive.
 */
function getRecentSheets() {
  console.log("Code.gs: Fetch recent sheets");
  const files = DriveApp.searchFiles('mimeType = "application/vnd.google-apps.spreadsheet" and trashed = false');
  const sheets = [];
  let count = 0;
  // Limit to first 50 sheets for performance
  while (files.hasNext() && count < 50) {
    const file = files.next();
    sheets.push({name: file.getName(), id: file.getId()});
    count++;
  }
  console.log(`Code.gs: Sheets fetched - ${count}`);
  return sheets;
}

/**
 * Fetches Gmail drafts
 */
function getGmailDrafts() {
  console.log("Code.gs: Fetching Drafts");
  const drafts = GmailApp.getDrafts();
  console.log(`Code.gs: Drafts fetched - ${drafts.length}`)
  return drafts.map(draft => {
    const message = draft.getMessage();
    return {
      subject: message.getSubject(),
      id: draft.getId()
    };
  });
}

/**
 * Gets OAuth token for Google Picker
 */
function getOAuthToken() {
  return ScriptApp.getOAuthToken();
}

/**
 * Get preview data (first 5 rows) from a spreadsheet
 */
function getPreviewData(sheetId) {
  console.log(`Code.gs: Getting preview data for sheet ${sheetId}`);
  try {
    const spreadsheet = SpreadsheetApp.openById(sheetId);
    const sheet = spreadsheet.getSheets()[0];
    const data = sheet.getDataRange().getDisplayValues();
    
    if (data.length === 0) {
      throw new Error("No data found in spreadsheet - the sheet appears to be empty");
    }
    
    if (data.length === 1) {
      throw new Error("No data rows found in spreadsheet - only headers are present. Please add data rows.");
    }
    
    const headers = data[0];
    // Get up to 5 data rows (excluding header)
    const rows = data.slice(1, Math.min(6, data.length));
    
    console.log(`Code.gs: Preview data fetched - ${rows.length} rows, ${headers.length} columns`);
    
    return {
      headers: headers,
      rows: rows
    };
  } catch (error) {
    throw new Error(`Failed to get preview data: ${error.message}`);
  }
}

/**
 * Extract variables from template text (handles HTML tags inside braces)
 */
function extractVariables(text) {
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
  return variables;
}

/**
 * Map variable names to their column indices in the spreadsheet
 */
function mapVariablesToColumns(headers, variables) {
  const variableColumnMap = {};
  variables.forEach(varName => {
    try {
      const colIndex = findColumnIndex(headers, varName);
      variableColumnMap[varName] = colIndex - 1; // Convert to 0-based for array access
      console.log(`Code.gs: Variable "${varName}" mapped to column index ${colIndex}`);
    } catch (error) {
      console.log(`Code.gs: Warning - Variable "${varName}" not found in spreadsheet headers`);
      variableColumnMap[varName] = -1; // Mark as not found
    }
  });
  return variableColumnMap;
}

/**
 * Get a Gmail draft message by matching the subject line.
 * Adapted from Google's Mail Merge script to properly handle attachments and inline images.
 * @param {string} subject_line to search for draft message
 * @return {object} containing the subject, plain and html message body and attachments
 */
function getGmailTemplateFromDrafts_(subject_line) {
  try {
    // get drafts
    const drafts = GmailApp.getDrafts();
    // filter the drafts that match subject line
    const draft = drafts.filter(d => d.getMessage().getSubject() === subject_line)[0];
    
    if (!draft) {
      throw new Error(`Draft with subject "${subject_line}" not found`);
    }
    
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
    throw new Error(`Oops - can't find Gmail draft: ${e.message}`);
  }
}

/**
 * Prepares email data including HTML, Attachments, and Inline Images
 */
function prepareEmailContext(sheetId, draftSubject, emailColumn) {
  try {
    const spreadsheet = SpreadsheetApp.openById(sheetId);
    const sheet = spreadsheet.getSheets()[0];
    const data = sheet.getDataRange().getDisplayValues();
    const headers = data[0];
    const rows = data.slice(1);
    
    if (rows.length === 0) throw new Error("No data rows found");
    
    // Use the Google Mail Merge function to get template with proper attachment/image handling
    const emailTemplate = getGmailTemplateFromDrafts_(draftSubject);
    
    const variablesInTemplate = extractVariables(emailTemplate.message.html);
    const variableColumnMap = mapVariablesToColumns(headers, variablesInTemplate);
    const emailColIndex = findColumnIndex(headers, emailColumn);
    
    return {
      rows,
      emailTemplate,
      variablesInTemplate,
      variableColumnMap,
      emailColIndex
    };
  } catch (error) {
    throw new Error(`Context Prep Failed: ${error.message}`);
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
  // We have two templates one for plain text and the html body
  // Stringifying the object means we can do a global replace
  let template_string = JSON.stringify(template);

  // Token replacement
  template_string = template_string.replace(/{{[^{}]+}}/g, (key) => {
    return escapeData_(data[key.replace(/[{}]+/g, "")] || "");
  });
  return JSON.parse(template_string);
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
}

/**
 * Get email preview using first row of data
 */
function getEmailPreview(sheetId, draftSubject, emailColumn) {
  console.log(`Code.gs: Getting email preview for sheet ${sheetId}, draft ${draftSubject}`);
  try {
    const emailContext = prepareEmailContext(sheetId, draftSubject, emailColumn);
    const emailData = processEmailRow(emailContext.rows[0], emailContext);
    
    console.log(`Code.gs: Email preview generated successfully`);
    
    return {
      subject: emailData.subject,
      to: emailData.to || 'recipient@example.com',
      body: emailData.html
    };
  } catch (error) {
    throw new Error(`Failed to generate email preview: ${error.message}`);
  }
}

/**
 * Helper function to convert column letter to index
 */
function columnLetterToIndex(letter) {
  let column = 0;
  const length = letter.length;
  for (let i = 0; i < length; i++) {
    column += (letter.charCodeAt(i) - 64) * Math.pow(26, length - i - 1);
  }
  console.log(`Code.gs: ColumnLetterToIndex Column - ${column}`)
  return column;
}

/**
 * Helper function to find column index by name or letter
 */
function findColumnIndex(headers, columnIdentifier) {
  try {
    // First, try to interpret as a letter (e.g., "D")
    if (/^[A-Za-z]+$/.test(columnIdentifier)) {
      return columnLetterToIndex(columnIdentifier.toUpperCase());
    }
    
    // Otherwise, search for column name
    const index = headers.findIndex(h => 
      h.toString().toLowerCase() === columnIdentifier.toLowerCase()
    );
    
    if (index === -1) {
      throw new Error(`Column "${columnIdentifier}" not found`);
    }

    console.log(`Code.gs: findColumnIndex - columnIdentified - ${columnIdentifier}, index - ${index+1}`)
    
    return index + 1; // Convert to 1-based index
  }
  catch (error) {
    throw new Error(`Error finding column index for "${columnIdentifier}": ${error.message}`);
  }
}

/**
 * The core logic to send emails.
 * @param {string} sheetId - The ID of the spreadsheet
 * @param {string} draftSubject - The subject of the Gmail draft
 * @param {string} emailColumn - The column containing email addresses
 * @param {number} startRow - The row number to start from (1-indexed, defaults to 1)
 */
function processAndSend(sheetId, draftSubject, emailColumn, startRow = 1) {
  console.log("Code.gs: Process and Send started");
  try {
    const emailContext = prepareEmailContext(sheetId, draftSubject, emailColumn);
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
    
    let emailsSent = 0;
    
    // Start from startRow - 1 (since array is 0-indexed but user input is 1-indexed)
    const rowsToProcess = emailContext.rows.slice(startRow - 1);
    
    rowsToProcess.forEach((row, index) => {
      const actualRowNumber = startRow + index;
      try {
        const emailData = processEmailRow(row, emailContext);
        
        if (!emailData.to || emailData.to.trim() === '') {
          console.log(`Code.gs: Skipping row ${index + 2} - no email address`);
          return;
        }
        
        // Use the proper sendEmail format from Google's Mail Merge script
        // See https://developers.google.com/apps-script/reference/gmail/gmail-app#sendEmail(String,String,String,Object)
        GmailApp.sendEmail(emailData.to, emailData.subject, emailData.text, {
          htmlBody: emailData.html,
          attachments: emailData.attachments,
          inlineImages: emailData.inlineImages
        });
        
        emailsSent++;
        
        Utilities.sleep(100);
      } catch (error) {
        Logger.log(`Error sending email to row ${index + 2}: ${error.message}`);
      }
    });

    console.log(`Code.gs: Emails sent - ${emailsSent}, totalRows ${emailContext.rows.length}`);
    
    return {
      success: true,
      emailsSent: emailsSent,
      totalRows: emailContext.rows.length
    };
  } catch (error) {
    throw new Error(`Email sending failed: ${error.message}`);
  }
}

/**
 * Send test email to current user
 */
function sendTestEmail(sheetId, draftSubject, emailColumn) {
  console.log("Code.gs: Sending test email");
  try {
    const userEmail = Session.getActiveUser().getEmail();
    const emailContext = prepareEmailContext(sheetId, draftSubject, emailColumn);
    
    // Use the first row for the test data
    const emailData = processEmailRow(emailContext.rows[0], emailContext);
    
    // Send test email with [TEST] prefix
    GmailApp.sendEmail(userEmail, "[TEST] " + emailData.subject, emailData.text, {
      htmlBody: emailData.html,
      attachments: emailData.attachments,
      inlineImages: emailData.inlineImages
    });
    
    console.log(`Code.gs: Test email sent to ${userEmail}`);
    
    return { success: true, sentTo: userEmail };
  } catch (error) {
    throw new Error(`Failed to send test email: ${error.message}`);
  }
}
