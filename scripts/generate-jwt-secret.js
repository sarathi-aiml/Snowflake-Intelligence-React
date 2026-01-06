#!/usr/bin/env node

/**
 * JWT Secret Generator Script
 * 
 * This script generates a secure JWT secret key for use in your application.
 * The generated secret is cryptographically secure and suitable for production use.
 * 
 * Usage:
 *   node scripts/generate-jwt-secret.js
 * 
 * Output:
 *   - Prints the generated secret to console
 *   - Can be copied directly to .env file as JWT_SECRET
 */

const crypto = require('crypto');

function generateJWTSecret() {
  // Generate a 32-byte (256-bit) random secret
  // Using base64 encoding for easy copy-paste into .env
  const secret = crypto.randomBytes(32).toString('base64');
  
  return secret;
}

function main() {
  console.log('\n🔐 JWT Secret Generator\n');
  console.log('Generated JWT Secret:');
  console.log('─'.repeat(60));
  console.log(generateJWTSecret());
  console.log('─'.repeat(60));
  console.log('\n📝 Instructions:');
  console.log('1. Copy the secret above');
  console.log('2. Add it to your .env file:');
  console.log('   JWT_SECRET=<paste-secret-here>');
  console.log('3. Keep this secret secure and never commit it to version control');
  console.log('4. Use the same secret for all environments (dev, staging, production)\n');
}

if (require.main === module) {
  main();
}

module.exports = { generateJWTSecret };

