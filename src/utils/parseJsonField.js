/**
 * Parses a JSON string from the request body if it exists
 * @param {object} reqBody - The request body object
 * @param {string} fieldName - The name of the field to parse
 * @param {boolean} [logMissing=false] - Whether to log if the field is missing
 * @returns {*} The parsed value or undefined if the field doesn't exist
 */
function parseJsonField(reqBody, fieldName, logMissing = false) {
  if (reqBody[fieldName]) {
    try {
      return JSON.parse(reqBody[fieldName]);
    } catch (error) {
      console.error(`Failed to parse ${fieldName}:`, error);
      return reqBody[fieldName]; // Return original value if parsing fails
    }
  } else {
    if (logMissing) {
      console.log(`${fieldName} is missing from req.body!`);
    }
    return undefined;
  }
}

module.exports = parseJsonField;

// Usage example:
// req.body.project_partners = parseJsonField(req.body, 'project_partners', true);
