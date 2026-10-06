// Installed only over the stopped, TEKKTEAM-owned legacy launch entrypoint.
// Retain original source in the deployment backup; canonical runtime is separate.
console.error('TEKKTEAM_LEGACY_LAUNCH_RETIRED: historical operation is quarantined; no listener, signing or broadcast started.');
process.exitCode=78;
