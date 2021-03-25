async function main() {
  const computeSetStats = require('.');
  const readline = require('readline');

  await computeSetStats();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("Done!");
  rl.question("Press enter key to exit...", ans => {
    rl.close();
  });
}

main();