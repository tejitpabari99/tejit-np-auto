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

// Fetches the saved key for the specific user
function getSavedKey() {
  console.log("Code.gs: Fetching saved key");
  return PropertiesService.getUserProperties().getProperty('GEMINI_KEY') || "";
}

// Saves the key so the NGO staff doesn't have to paste it next year
function saveKey(key) {
  console.log("Code.gs: Saving key...");
  PropertiesService.getUserProperties().setProperty('GEMINI_KEY', key);
  return "Key saved securely!";
}

/**
 * Fetches recent Google Sheets from the user's Drive.
 */
function getRecentSheets() {
  console.log("Code.gs: Fetch recent sheets");
  const files = DriveApp.searchFiles('mimeType = "application/vnd.google-apps.spreadsheet" and trashed = false');
  const sheets = [];
  let count = 0;
  // Limit to first 100 sheets for performance
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
 * Extract variables from template text (e.g., {{First Name}}, {{Company}})
 */
function extractVariables(text) {
  const variablePattern = /\{\{([^}]+)\}\}/g;
  const variables = [];
  let match;
  while ((match = variablePattern.exec(text)) !== null) {
    const varName = match[1].trim();
    if (!variables.includes(varName)) {
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
 * Get draft by subject from Gmail
 */
function getDraftBySubject(draftSubject) {
  const drafts = GmailApp.getDrafts();
  const draft = drafts.find(d => d.getMessage().getSubject() === draftSubject);
  
  if (!draft) {
    throw new Error(`Draft with subject "${draftSubject}" not found`);
  }
  
  return draft;
}

/**
 * Get email preview using first row of data
 */
function getEmailPreview(sheetId, draftSubject, emailColumn) {
  console.log(`Code.gs: Getting email preview for sheet ${sheetId}, draft ${draftSubject}`);
  try {
    const sheet = SpreadsheetApp.openById(sheetId).getSheets()[0];
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1);
    
    if (rows.length === 0) {
      throw new Error("No data rows found in spreadsheet");
    }
    
    const draft = getDraftBySubject(draftSubject);
    const bodyTemplate = draft.getMessage().getPlainBody();
    
    // Extract and map variables
    const variablesInTemplate = extractVariables(bodyTemplate);
    const variableColumnMap = mapVariablesToColumns(headers, variablesInTemplate);
    
    // Use the first row of data to create preview
    const firstRow = rows[0];
    const finalBody = replaceVariables(bodyTemplate, firstRow, variableColumnMap, variablesInTemplate);
    
    // Use the user-selected email column
    const emailColIndex = findColumnIndex(headers, emailColumn);
    const emailAddress = firstRow[emailColIndex - 1] || 'recipient@example.com';
    
    console.log(`Code.gs: Email preview generated successfully`);
    
    return {
      subject: draftSubject,
      to: emailAddress,
      body: finalBody
    };
  } catch (error) {
    throw new Error(`Failed to generate email preview: ${error.message}`);
  }
}

/**
 * Helper function to replace variables in text with values from a row
 * Common function used by both email sending and AI personalization
 */
function replaceVariables(text, row, variableColumnMap, variablesInTemplate) {
  let result = text;
  
  variablesInTemplate.forEach(varName => {
    const colIndex = variableColumnMap[varName];
    let value = '';
    
    if (colIndex >= 0 && colIndex < row.length) {
      value = row[colIndex] || '';
    }
    
    // Replace all occurrences of this variable
    const regex = new RegExp(`\\{\\{\\s*${varName}\\s*\\}\\}`, 'g');
    result = result.replace(regex, value);
  });
  
  // Remove lines that are empty or contain only whitespace after variable replacement
  const lines = result.split('\n');
  const cleanedLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Keep the line if it has content
    if (trimmedLine !== '') {
      cleanedLines.push(line);
    } else {
      // For empty lines, only keep them if the previous line wasn't also empty
      // This prevents multiple consecutive blank lines
      if (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1].trim() !== '') {
        cleanedLines.push(line);
      }
    }
  }
  
  // Remove any trailing blank lines
  while (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1].trim() === '') {
    cleanedLines.pop();
  }
  
  return cleanedLines.join('\n');
}

/**
 * Calls Gemini API to personalize text.
 */
function getAIPersonalization(prompt, apiKey) {
  console.log("Code.gs: Get AI Personalization")
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: `Write a warm, 1-sentence opening for an email based on: ${prompt}` }] }]
  };
  const response = UrlFetchApp.fetch(url, {
    method: 'post', 
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  console.log("Code.gs: AI Personalization fetched")
  
  const result = JSON.parse(response.getContentText());
  if (result.error) {
    throw new Error(result.error.message);
  }
  
  return result.candidates[0].content.parts[0].text;
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

/**
 * Generate AI personalization for all rows in the spreadsheet
 */
function generateAIPersonalization(sheetId, inputColumn, outputColumn, apiKey) {
  console.log(`Code.gs: Generating AI Personalization`)
  try {
    const spreadsheet = SpreadsheetApp.openById(sheetId);
    const sheet = spreadsheet.getSheets()[0];
    const data = sheet.getDataRange().getValues();
    
    if (data.length < 2) {
      throw new Error("Spreadsheet must have at least a header row and one data row");
    }
    
    const headers = data[0];
    const rows = data.slice(1);
    
    // Find column indices
    const inputColIndex = findColumnIndex(headers, inputColumn);
    const outputColIndex = findColumnIndex(headers, outputColumn);
    
    // Extract all variables from the input column template (e.g., {{First Name}}, {{Company}})
    const variablePattern = /\{\{([^}]+)\}\}/g;
    const variablesInTemplate = [];
    let match;
    
    // Check the input column value for variables
    const inputColValue = rows.length > 0 ? rows[0][inputColIndex - 1] : '';
    const tempString = inputColValue ? inputColValue.toString() : '';
    
    while ((match = variablePattern.exec(tempString)) !== null) {
      const varName = match[1].trim();
      if (!variablesInTemplate.includes(varName)) {
        variablesInTemplate.push(varName);
      }
    }
    
    // Map variable names to column indices
    const variableColumnMap = {};
    variablesInTemplate.forEach(varName => {
      try {
        const colIndex = findColumnIndex(headers, varName);
        variableColumnMap[varName] = colIndex - 1; // Convert to 0-based for array access
        console.log(`Code.gs: Variable "${varName}" mapped to column index ${colIndex}`)
      } catch (error) {
        console.log(`Code.gs: Warning - Variable "${varName}" not found in spreadsheet headers`);
        variableColumnMap[varName] = -1; // Mark as not found
      }
    });
    
    // Generate personalization for each row
    const results = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let inputValue = row[inputColIndex - 1]; // Convert back to 0-based for array
      
      // Replace variables in the input value if any exist
      if (variablesInTemplate.length > 0 && inputValue) {
        inputValue = replaceVariables(inputValue.toString(), row, variableColumnMap, variablesInTemplate);
      }
      
      if (inputValue && inputValue.toString().trim() !== '') {
        try {
          const personalizedText = getAIPersonalization(inputValue, apiKey);
          results.push(personalizedText);
          
          // Write to spreadsheet immediately
          sheet.getRange(i + 2, outputColIndex).setValue(personalizedText);
          
          // Add a small delay to avoid rate limiting
          Utilities.sleep(500);
        } catch (error) {
          results.push(`Error: ${error.message}`);
          sheet.getRange(i + 2, outputColIndex).setValue(`Error: ${error.message}`);
        }
      } else {
        results.push('');
        sheet.getRange(i + 2, outputColIndex).setValue('');
      }
    }

    console.log(`Code.gs: Personalization Complete - rowsProcessed - ${rows.length}, sheetId: ${sheetId}`)
    
    return {
      success: true,
      rowsProcessed: rows.length,
      sheetId: sheetId
    };
  } catch (error) {
    throw new Error(`Generation failed: ${error.message}`);
  }
}

/**
 * The core logic to send emails.
 */
function processAndSend(sheetId, draftSubject, emailColumn) {
  console.log("Code.gs: Process and Send started");
  try {
    const sheet = SpreadsheetApp.openById(sheetId).getSheets()[0];
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1);
    console.log(`Code.gs: Headers - ${rows.length}`);
    
    const draft = getDraftBySubject(draftSubject);
    const emailColIndex = findColumnIndex(headers, emailColumn);
    console.log(`Code.gs: Email column index - ${emailColIndex}`);
    
    const bodyTemplate = draft.getMessage().getPlainBody();
    
    // Extract and map variables
    const variablesInTemplate = extractVariables(bodyTemplate);
    console.log(`Code.gs: Variables found in template - ${variablesInTemplate.join(', ')}`);
    const variableColumnMap = mapVariablesToColumns(headers, variablesInTemplate);
    
    let emailsSent = 0;

    rows.forEach((row, index) => {
      try {
        const email = row[emailColIndex - 1]; // Convert to 0-based index
        if (!email || email.toString().trim() === '') {
          console.log(`Code.gs: Skipping row ${index + 2} - no email address`);
          return;
        }
        
        const finalBody = replaceVariables(bodyTemplate, row, variableColumnMap, variablesInTemplate);
        GmailApp.sendEmail(email, draftSubject, finalBody);
        emailsSent++;
        
        Utilities.sleep(100);
      } catch (error) {
        Logger.log(`Error sending email to row ${index + 2}: ${error.message}`);
      }
    });

    console.log(`Code.gs: Emails sent - ${emailsSent}, totalRows ${rows.length}`);
    
    return {
      success: true,
      emailsSent: emailsSent,
      totalRows: rows.length
    };
  } catch (error) {
    throw new Error(`Email sending failed: ${error.message}`);
  }
}

/**
 * Send a test email using the first row of data to the signed-in user
 */
function sendTestEmail(sheetId, draftSubject) {
  console.log("Code.gs: Send Test Email started");
  try {
    const sheet = SpreadsheetApp.openById(sheetId).getSheets()[0];
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1);
    
    if (rows.length === 0) {
      throw new Error("No data rows found in spreadsheet");
    }
    
    const userEmail = Session.getActiveUser().getEmail();
    console.log(`Code.gs: Test email will be sent to: ${userEmail}`);
    
    const draft = getDraftBySubject(draftSubject);
    const bodyTemplate = draft.getMessage().getPlainBody();
    
    // Extract and map variables
    const variablesInTemplate = extractVariables(bodyTemplate);
    console.log(`Code.gs: Variables found in template - ${variablesInTemplate.join(', ')}`);
    const variableColumnMap = mapVariablesToColumns(headers, variablesInTemplate);
    
    const firstRow = rows[0];
    let finalBody = replaceVariables(bodyTemplate, firstRow, variableColumnMap, variablesInTemplate);
    finalBody += '\n\n----\nThis is a test email.';
    
    GmailApp.sendEmail(userEmail, draftSubject, finalBody);
    console.log(`Code.gs: Test email sent to ${userEmail}`);
    
    return {
      success: true,
      sentTo: userEmail
    };
  } catch (error) {
    throw new Error(`Test email failed: ${error.message}`);
  }
}
