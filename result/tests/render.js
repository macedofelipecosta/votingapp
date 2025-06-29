// result/tests/render.js
const puppeteer = require('puppeteer');

(async () => {
  const url = process.argv[2]; // Leer URL desde argumentos
  if (!url) {
    console.error("Falta la URL como argumento");
    process.exit(1);
  }

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle0' });

    const content = await page.content();

    if (content.includes('1 vote')) {
      console.log('✔ Test passed: Se encontró "1 vote"');
      await browser.close();
      process.exit(0);
    } else {
      console.error('✘ Test failed: No se encontró "1 vote"');
      await browser.close();
      process.exit(1);
    }
  } catch (error) {
    console.error('✘ Error al ejecutar test:', error);
    await browser.close();
    process.exit(1);
  }
})();
