require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const HF_TOKEN = process.env.HF_TOKEN;
const HF_MODEL = 'sentence-transformers/clip-ViT-B-32';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getEmbedding(imageUrl, retries = 3) {
  let imgRes;
  try {
    imgRes = await fetch(imageUrl);
  } catch (err) {
    console.error(`  Raw fetch error for ${imageUrl}:`, err.cause || err);
    throw err;
  }
  if (!imgRes.ok) {
    throw new Error(`Image fetch returned status ${imgRes.status} for ${imageUrl}`);
  }
  const imgBuffer = await imgRes.arrayBuffer();

  let res;
  try {
    res = await fetch(`https://router.huggingface.co/hf-inference/models/${HF_MODEL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/octet-stream',
      },
      body: Buffer.from(imgBuffer),
    });
  } catch (err) {
    console.error(`  Raw HF fetch error:`, err.cause || err);
    throw err;
  }

  const data = await res.json();

  if (data.error && data.estimated_time && retries > 0) {
    console.log(`  Model warming up, waiting ${Math.ceil(data.estimated_time)}s...`);
    await sleep(data.estimated_time * 1000);
    return getEmbedding(imageUrl, retries - 1);
  }

  if (data.error) {
    throw new Error(`HF API error: ${data.error}`);
  }

  return data;
}

async function main() {
  // TCGdex's confirmed ID for the original 1999 Base Set
  const setId = 'base1';

  console.log(`Fetching full card list for set "${setId}"...`);
  const setRes = await fetch(`https://api.tcgdex.net/v2/en/sets/${setId}`);
  const setData = await setRes.json();
  const cardBriefs = setData.cards || [];
  console.log(`Found ${cardBriefs.length} cards.\n`);

  let successCount = 0;
  let failCount = 0;

  for (const [i, brief] of cardBriefs.entries()) {
    try {
      // TCGdex image URLs need a size/format suffix to resolve to an actual image file
      const imageUrl = `${brief.image}/low.png`;

      console.log(`[${i + 1}/${cardBriefs.length}] Embedding ${brief.name}...`);
      const embedding = await getEmbedding(imageUrl);

      const { error } = await supabase.from('cards').insert({
        name: brief.name,
        set_name: setData.name,
        card_number: brief.localId,
        image_url: imageUrl,
        embedding: embedding,
      });

      if (error) throw error;
      successCount++;
    } catch (err) {
      console.error(`  Failed on ${brief.name}: ${err.message}`);
      failCount++;
    }

    await sleep(500);
  }

  console.log(`\nDone. ${successCount} cards embedded and stored, ${failCount} failed.`);
}

main();