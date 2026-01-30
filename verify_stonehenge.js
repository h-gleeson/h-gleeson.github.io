const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
        const text = msg.text();
        // We EXPECT StoneHenge.glb to fail loading because it doesn't exist yet.
        // We want to verify that other things don't break.
        if (text.includes('StoneHenge.glb')) {
            console.log('Expected Error (File Missing):', text);
        } else {
            console.error('Unexpected Console Error:', text);
            errors.push(text);
        }
    } else {
        // console.log('Console:', msg.text());
    }
  });

  try {
    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000');

    console.log('Waiting for scene to load...');
    await page.waitForTimeout(3000);

    if (errors.length > 0) {
        console.error('Verification FAILED: Unexpected console errors detected.');
        process.exit(1);
    }

    console.log('Verification PASSED (Scene loaded, StoneHenge missing as expected).');
  } catch (e) {
    console.error('Script failed:', e);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
