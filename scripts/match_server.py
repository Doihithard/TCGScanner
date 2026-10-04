import os
from io import BytesIO

from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
from sentence_transformers import SentenceTransformer
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

print("Loading CLIP model (uses the same local cache from the embedding script)...")
model = SentenceTransformer("clip-ViT-L-14")
print("Model loaded. Server ready.\n")

app = Flask(__name__)
CORS(app)  # allows your phone app to call this server across the network


@app.route("/match", methods=["POST"])
def match_card():
    if "image" not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    file = request.files["image"]
    img = Image.open(BytesIO(file.read())).convert("RGB")

    embedding = model.encode(img).tolist()

    result = supabase.rpc(
        "match_cards", {"query_embedding": embedding, "match_count": 5}
    ).execute()

    return jsonify({"matches": result.data})


@app.route("/", methods=["GET"])
def health_check():
    # Simple route so Render (or you, in a browser) can confirm the server is alive
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    # Render (and most hosts) assign a port dynamically via this env var;
    # falls back to 5000 for local testing where it's not set
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)