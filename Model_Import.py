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

DOMAIN_KEYWORDS = {
	"medical": {
		"clinic", "clinical", "doctor", "dosage", "health", "hospital", "medical",
		"medicine", "patient", "pharma", "therapy", "treatment", "vaccine",
	},
	"legal": {
		"appeal", "case", "clause", "contract", "court", "evidence", "judge",
		"law", "legal", "liability", "rights", "statute", "trial",
	},
	"technical": {
		"algorithm", "api", "code", "computer", "data", "database", "graph",
		"model", "network", "nlp", "pipeline", "python", "resolver", "software",
		"token", "translation",
	},
	"slang": {
		"bruh", "gonna", "kinda", "lol", "nah", "slang", "wanna", "yall",
	},
}

RELATED_TERMS = {
	"computer": ["model", "software", "data"],
	"translation": ["language", "token", "model"],
	"language": ["translation", "token", "corpus"],
	"model": ["algorithm", "data", "training"],
	"graph": ["node", "edge", "network"],
	"token": ["vocabulary", "subword", "unknown"],
}

SUFFIX_RULES = (
	("ization", "ize"),
	("ation", "ate"),
	("ing", ""),
	("ed", ""),
	("ies", "y"),
	("s", ""),
)

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


def infer_domain(word, source_context=None):
	"""Infer a coarse semantic domain from the token and nearby context."""
	context_words = set(token.lower() for token in tokenize_words(source_context or ""))
	word_lower = word.lower()
	for domain, keywords in DOMAIN_KEYWORDS.items():
		if word_lower in keywords or context_words.intersection(keywords):
			return domain
	if word[:1].isupper():
		return "proper_noun"
	return "general"


def infer_related_terms(word, source_context=None, limit=3):
	"""Return lightweight semantic neighbors from known terms and sentence context."""
	word_lower = word.lower()
	related = list(RELATED_TERMS.get(word_lower, []))
	context_words = [
		token.lower()
		for token in tokenize_words(source_context or "")
		if token.lower() != word_lower
	]
	for token in context_words:
		if token not in related:
			related.append(token)
	return related[:limit]


def infer_morphological_root(word):
	"""Infer a simple morphological root for graph lineage edges."""
	word_lower = word.lower()
	for suffix, replacement in SUFFIX_RULES:
		if word_lower.endswith(suffix) and len(word_lower) > len(suffix) + 2:
			return f"{word_lower[:-len(suffix)]}{replacement}"
	return None


def resolve_word(word, language="en", source_context=None, stage_hint="context_inference"):
	translation = translate_text(word)
	domain = infer_domain(word, source_context)
	related_terms = infer_related_terms(word, source_context)
	morphological_root = infer_morphological_root(word)

	if translation and translation.strip() and translation.lower() != word.lower():
		confidence = "inferred"
		return {
			"success": True,
			"translation": translation,
			"stage": stage_hint,
			"confidence": confidence,
			"domain": domain,
			"language": language,
			"relatedTerms": related_terms,
			"morphologicalRoot": morphological_root,
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
			"relatedTerms": related_terms,
			"morphologicalRoot": morphological_root,
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
		"domain": domain,
		"language": language,
		"relatedTerms": related_terms,
		"morphologicalRoot": morphological_root,
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
	edge_color_map = {
		"translates_to": "#4F8EF7",
		"belongs_to": "#7E57C2",
		"related_to": "#26A69A",
		"derived_from": "#8D6E63",
		"conflicts_with": "#EF5350",
	}
	nodes = []
	edges = []
	seen_ids = set()
	seen_edges = set()

	def add_node(node_id, label, size, color, attributes):
		if node_id in seen_ids:
			return
		nodes.append({
			"key": node_id,
			"label": label,
			"size": size,
			"color": color,
			"attributes": attributes,
		})
		seen_ids.add(node_id)

	def add_edge(source, target, label, weight=0.8, attributes=None):
		edge_key = f"edge_{label}_{source}_{target}"
		if edge_key in seen_edges:
			return
		edges.append({
			"key": edge_key,
			"source": source,
			"target": target,
			"label": label,
			"weight": weight,
			"attributes": {
				"semanticType": label,
				"relationGroup": label,
				"color": edge_color_map.get(label, "#999999"),
				**(attributes or {}),
			},
		})
		seen_edges.add(edge_key)

	for item in resolutions:
		word = item["word"]
		lang = item.get("language", "en")
		result = item["result"]
		confidence = result.get("confidence", "unknown")
		domain = result.get("domain", "general")

		src_id = f"node_{lang}_{word.lower().replace(' ', '_')}"
		add_node(src_id, word, 10, color_map.get(confidence, "#FF6B6B"), {
			"language": lang,
			"domain": domain,
			"confidence": confidence,
			"occurrences": 1,
			"tokenInspection": item.get("tokenInspection"),
		})

		domain_id = f"domain_{domain.lower().replace(' ', '_')}"
		add_node(domain_id, domain, 9, "#7E57C2", {
			"language": "domain",
			"domain": domain,
			"confidence": "verified",
			"occurrences": 1,
			"nodeType": "semantic_domain",
		})
		add_edge(src_id, domain_id, "belongs_to", 1, {"domain": domain})

		for related_term in result.get("relatedTerms", []):
			related_word = related_term["word"] if isinstance(related_term, dict) else related_term
			related_lang = related_term.get("language", lang) if isinstance(related_term, dict) else lang
			related_weight = related_term.get("weight", 0.6) if isinstance(related_term, dict) else 0.6
			related_id = f"node_{related_lang}_{related_word.lower().replace(' ', '_')}"
			add_node(related_id, related_word, 8, "#FF6B6B", {
				"language": related_lang,
				"domain": domain,
				"confidence": "unknown",
				"occurrences": 1,
			})
			add_edge(src_id, related_id, "related_to", related_weight, {"relation": "semantic_neighbor"})

		root = result.get("morphologicalRoot")
		if root and root.lower() != word.lower():
			root_id = f"node_{lang}_{root.lower().replace(' ', '_')}"
			add_node(root_id, root, 8, "#FF6B6B", {
				"language": lang,
				"domain": domain,
				"confidence": "unknown",
				"occurrences": 1,
			})
			add_edge(src_id, root_id, "derived_from", 0.8, {"root": root})

		if result.get("success") and result.get("translation"):
			trans = result["translation"]
			target_lang = "fr" if lang == "en" else lang
			tgt_id = f"node_{target_lang}_{trans.lower().replace(' ', '_')}"

			add_node(tgt_id, trans, 10, color_map["inferred"], {
				"language": target_lang,
				"domain": domain,
				"confidence": "inferred",
				"occurrences": 1,
			})
			add_edge(src_id, tgt_id, "translates_to", 0.8, {
				"resolutionStage": result.get("stage"),
				"confidence": confidence,
			})

			for prior_edge in list(edges):
				if (
					prior_edge["source"] == src_id and
					prior_edge["label"] == "translates_to" and
					prior_edge["target"] != tgt_id
				):
					add_edge(tgt_id, prior_edge["target"], "conflicts_with", 0.7, {
						"reason": "competing_translation",
						"sourceWord": word,
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
							"domain": r["result"].get("domain"),
							"relatedTerms": r["result"].get("relatedTerms", []),
							"morphologicalRoot": r["result"].get("morphologicalRoot"),
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
