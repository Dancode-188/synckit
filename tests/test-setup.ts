/**
 * Test Setup - runs before any tests
 *
 * Sets environment variables that need to be in place before modules are loaded.
 * This file is specified in bunfig.toml as a preload script.
 */

// Set high connection limit for load tests (needs to be set before security middleware loads)
process.env.SYNCKIT_MAX_CONNECTIONS_PER_IP = '2000';
process.env.SYNCKIT_MAX_MESSAGES_PER_MINUTE = '10000';
