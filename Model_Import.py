# install transformers, sentencepiece, and torch in terminal before running

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from transformers import MarianMTModel, MarianTokenizer
import re

MODEL_NAME = "Helsinki-NLP/opus-mt-en-fr"
HOST = os.getenv("PY_MODEL_HOST", "127.0.0.1")
PORT = int(os.getenv("PY_MODEL_PORT", "8000"))

tokenizer = MarianTokenizer.from_pretrained(MODEL_NAME)
model = MarianMTModel.from_pretrained(MODEL_NAME)


def translate_text(text):
	batch = tokenizer([text], return_tensors="pt", padding=True)
	generated = model.generate(**batch)
	return tokenizer.batch_decode(generated, skip_special_tokens=True)[0]


def inspect_token(word):
	"""Return tokenizer-level OOV details for one source token."""
	pieces = tokenizer.tokenize(word)
	token_ids = tokenizer.convert_tokens_to_ids(pieces)
	unk_token = tokenizer.unk_token
	unk_token_id = tokenizer.unk_token_id
	is_oov = any(piece == unk_token for piece in pieces) or any(token_id == unk_token_id for token_id in token_ids)

	return {
		"word": word,
		"pieces": pieces,
		"tokenIds": token_ids,
		"isOov": is_oov,
		"reason": "unknown_token" if is_oov else "in_vocabulary",
	}


def detect_oov_words(text):
	"""Extract unique words and classify them using the Marian tokenizer vocabulary."""
	return [inspect_token(word) for word in tokenize_words(text)]


def resolve_word(word, language="en", source_context=None, stage_hint="context_inference"):
	translation = translate_text(word)

	if translation and translation.strip() and translation.lower() != word.lower():
		confidence = "inferred"
		return {
			"success": True,
			"translation": translation,
			"stage": stage_hint,
			"confidence": confidence,
			"domain": "general",
			"language": language,
			"relatedTerms": [],
			"evidence": {
				"model": MODEL_NAME,
				"sourceContext": source_context,
				"tokenInspection": inspect_token(word),
			},
		}

	# Fallback for names/proper nouns when translation is unchanged
	if stage_hint == "transliteration" and word[:1].isupper():
		return {
			"success": True,
			"translation": word,
			"stage": "transliteration",
			"confidence": "inferred",
			"domain": "proper_noun",
			"language": language,
			"relatedTerms": [],
			"evidence": {
				"model": MODEL_NAME,
				"sourceContext": source_context,
				"tokenInspection": inspect_token(word),
			},
		}

	return {
		"success": False,
		"translation": None,
		"stage": "manual_review",
		"confidence": "unknown",
		"domain": "general",
		"language": language,
		"relatedTerms": [],
		"evidence": {
			"model": MODEL_NAME,
			"sourceContext": source_context,
			"tokenInspection": inspect_token(word),
		},
	}


def tokenize_words(text):
	"""Extract unique words from text for OOV resolution."""
	words = re.findall(r"\b[a-zA-Z']+\b", text)
	seen = set()
	unique = []
	for w in words:
		lower = w.lower()
		if lower not in seen:
			seen.add(lower)
			unique.append(w)
	return unique


def build_sigma_graph_data(resolutions):
	"""Build Sigma-compatible graph data from a list of resolution dicts."""
	color_map = {
		"verified": "#66BB6A",
		"inferred": "#FFA726",
		"unknown": "#FF6B6B",
	}
	nodes = []
	edges = []
	seen_ids = set()

	for item in resolutions:
		word = item["word"]
		lang = item.get("language", "en")
		result = item["result"]
		confidence = result.get("confidence", "unknown")

		src_id = f"node_{lang}_{word.lower().replace(' ', '_')}"
		if src_id not in seen_ids:
			nodes.append({
				"key": src_id,
				"label": word,
				"size": 10,
				"color": color_map.get(confidence, "#FF6B6B"),
				"attributes": {
					"language": lang,
					"domain": result.get("domain", "general"),
					"confidence": confidence,
					"occurrences": 1,
				},
			})
			seen_ids.add(src_id)

		if result.get("success") and result.get("translation"):
			trans = result["translation"]
			target_lang = "fr" if lang == "en" else lang
			tgt_id = f"node_{target_lang}_{trans.lower().replace(' ', '_')}"

			if tgt_id not in seen_ids:
				nodes.append({
					"key": tgt_id,
					"label": trans,
					"size": 10,
					"color": color_map["inferred"],
					"attributes": {
						"language": target_lang,
						"domain": result.get("domain", "general"),
						"confidence": "inferred",
						"occurrences": 1,
					},
				})
				seen_ids.add(tgt_id)

			edges.append({
				"key": f"edge_{src_id}_{tgt_id}",
				"source": src_id,
				"target": tgt_id,
				"label": "translates_to",
				"weight": 0.8,
				"attributes": {"semanticType": "translates_to"},
			})

	return {"nodes": nodes, "edges": edges}


class ModelRequestHandler(BaseHTTPRequestHandler):
	def _get_route_path(self):
		return urlsplit(self.path).path.rstrip("/") or "/"

	def _write_json(self, status_code, payload):
		body = json.dumps(payload).encode("utf-8")
		self.send_response(status_code)
		self.send_header("Content-Type", "application/json")
		self.send_header("Access-Control-Allow-Origin", "*")
		self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		self.send_header("Access-Control-Allow-Headers", "Content-Type")
		self.send_header("Content-Length", str(len(body)))
		self.end_headers()
		self.wfile.write(body)

	def do_OPTIONS(self):
		self._write_json(200, {"ok": True})

	def do_GET(self):
		route_path = self._get_route_path()
		if route_path == "/health":
			self._write_json(
				200,
				{
					"status": "ok",
					"model": MODEL_NAME,
					"unkToken": tokenizer.unk_token,
					"unkTokenId": tokenizer.unk_token_id,
				},
			)
			return

		self._write_json(404, {"error": "Route not found", "path": route_path})

	def do_POST(self):
		route_path = self._get_route_path()
		if route_path not in ("/resolve", "/tokenize", "/detect-oov", "/translate-sentence"):
			self._write_json(404, {"error": "Route not found", "path": route_path})
			return

		try:
			content_length = int(self.headers.get("Content-Length", "0"))
			raw_body = self.rfile.read(content_length) if content_length else b"{}"
			payload = json.loads(raw_body.decode("utf-8"))

		except json.JSONDecodeError:
			self._write_json(400, {"error": "Invalid JSON payload"})
			return

		try:
			if route_path == "/resolve":
				word = payload.get("word")
				language = payload.get("language", "en")
				source_context = payload.get("sourceContext")
				stage_hint = payload.get("stageHint", "context_inference")

				if not isinstance(word, str) or not word.strip():
					self._write_json(400, {"error": "'word' must be a non-empty string"})
					return

				response = resolve_word(
					word=word.strip(),
					language=language,
					source_context=source_context,
					stage_hint=stage_hint,
				)
				self._write_json(200, response)

			elif route_path == "/tokenize":
				text = payload.get("text", "")
				if not isinstance(text, str) or not text.strip():
					self._write_json(400, {"error": "'text' must be a non-empty string"})
					return
				words = tokenize_words(text.strip())
				self._write_json(200, {"tokens": words, "count": len(words)})

			elif route_path == "/detect-oov":
				text = payload.get("text", "")
				if not isinstance(text, str) or not text.strip():
					self._write_json(400, {"error": "'text' must be a non-empty string"})
					return
				detections = detect_oov_words(text.strip())
				oov_tokens = [item for item in detections if item["isOov"]]
				oov_token_rate = round(len(oov_tokens) / len(detections) * 100, 2) if detections else 0
				self._write_json(200, {
					"tokens": detections,
					"oovTokens": oov_tokens,
					"totalTokenCount": len(detections),
					"oovTokenCount": len(oov_tokens),
					"oovTokenRate": oov_token_rate,
					"unresolvedTokenRate": oov_token_rate,
					"model": MODEL_NAME,
					"unkToken": tokenizer.unk_token,
					"unkTokenId": tokenizer.unk_token_id,
				})

			elif route_path == "/translate-sentence":
				text = payload.get("text", "")
				language = payload.get("language", "en")
				if not isinstance(text, str) or not text.strip():
					self._write_json(400, {"error": "'text' must be a non-empty string"})
					return
				token_detections = detect_oov_words(text.strip())
				words = [item["word"] for item in token_detections if item["isOov"]]
				resolutions = []
				resolved_count = 0
				for word in words:
					result = resolve_word(word, language, text.strip())
					resolutions.append({
						"word": word,
						"language": language,
						"tokenInspection": inspect_token(word),
						"result": result,
					})
					if result.get("success"):
						resolved_count += 1
				sigma_data = build_sigma_graph_data(resolutions)
				total = len(token_detections)
				oov_total = len(words)
				oov_token_rate = round(oov_total / total * 100, 2) if total else 0
				self._write_json(200, {
					"translation": translate_text(text.strip()),
					"tokens": token_detections,
					"oovTokens": [item for item in token_detections if item["isOov"]],
					"sigmaData": sigma_data,
					"statistics": {
						"totalNodesProcessed": total,
						"resolvedNodes": resolved_count,
						"unresolvedNodes": oov_total - resolved_count,
						"oovTokenCount": oov_total,
						"oovTokenRate": oov_token_rate,
						"unresolvedTokenRate": oov_token_rate,
						"resolutionSuccessRate": round(resolved_count / oov_total * 100, 2) if oov_total else 100,
						"totalNodes": len(sigma_data["nodes"]),
						"totalEdges": len(sigma_data["edges"]),
					},
					"resolutions": [
						{
							"word": r["word"],
							"translation": r["result"].get("translation"),
							"success": r["result"].get("success"),
							"tokenInspection": r["tokenInspection"],
						}
						for r in resolutions
					],
					"source": "live-sentence",
				})

		except Exception as exc:  # pragma: no cover - defensive runtime path
			self._write_json(500, {"error": "Handler failed", "detail": str(exc)})


if __name__ == "__main__":
	server = ThreadingHTTPServer((HOST, PORT), ModelRequestHandler)
	print(f"Model API ready on http://{HOST}:{PORT}")
	print(f"Using model: {MODEL_NAME}")
	server.serve_forever()
