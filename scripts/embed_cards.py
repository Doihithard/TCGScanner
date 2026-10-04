import os
import time
import requests
from io import BytesIO
from PIL import Image
from sentence_transformers import SentenceTransformer
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

print("Loading CLIP model locally (larger model, ~1.7GB download, one-time)...")
model = SentenceTransformer("clip-ViT-L-14")
print("Model loaded.\n")

SET_ID = "base1"


def get_set_cards():
    print(f'Fetching card list for set "{SET_ID}"...')
    res = requests.get(f"https://api.tcgdex.net/v2/en/sets/{SET_ID}")
    res.raise_for_status()
    data = res.json()
    print(f"Found {len(data['cards'])} cards.\n")
    return data["name"], data["cards"]


def embed_image(image_url):
    resp = requests.get(image_url, timeout=15)
    resp.raise_for_status()
    img = Image.open(BytesIO(resp.content)).convert("RGB")
    embedding = model.encode(img)
    return embedding.tolist()


def main():
    set_name, cards = get_set_cards()

    success_count = 0
    fail_count = 0

    for i, brief in enumerate(cards, start=1):
        name = brief["name"]
        image_url = f"{brief['image']}/high.png"

        try:
            print(f"[{i}/{len(cards)}] Embedding {name}...")
            embedding = embed_image(image_url)

            supabase.table("cards").insert(
                {
                    "name": name,
                    "set_name": set_name,
                    "card_number": brief["localId"],
                    "image_url": image_url,
                    "embedding": embedding,
                }
            ).execute()

            success_count += 1
        except Exception as e:
            print(f"  Failed on {name}: {e}")
            fail_count += 1

        time.sleep(0.1)  # brief pause, mostly courteous to the image host

    print(f"\nDone. {success_count} cards embedded and stored, {fail_count} failed.")


if __name__ == "__main__":
    main()