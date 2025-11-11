// routes/geocode-bulk.ts (Express)
import express from "express";


const router = express.Router();
const cache = new Map<string, { lat: number; lng: number }>();
// Kakao 주소검색 응답 타입(필요 필드만)
interface KakaoAddressSearchResponse {
  documents: Array<{
    x: string; // 경도
    y: string; // 위도
    address_name?: string;
    road_address?: {
      address_name?: string;
      building_name?: string;
    } | null;
  }>;
  meta?: unknown;
}
function buildQuery(it: { postcode?: string; address?: string; address_detail?: string }) {
  const s = `${it.address ?? ""}`.trim();
  if (s) return s;
  if (it.postcode) return it.postcode;
  return "";
}

async function geocodeOne(query: string, key: string) {
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`;
  console.log(url);
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
  if (!res.ok) throw new Error(`Kakao API: ${res.status}`);
  const json = (await res.json()) as KakaoAddressSearchResponse;

  const doc = json?.documents?.[0];
  if (!doc) return null;
  const lng = parseFloat(doc.x); // 경도
  const lat = parseFloat(doc.y); // 위도
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

async function mapWithConcurrency<T, R>(list: T[], limit: number, fn: (v: T, i: number) => Promise<R>) {
  const out: R[] = new Array(list.length) as R[];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (i < list.length) {
      const idx = i++;
      out[idx] = await fn(list[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

router.post("/bulk", express.json(), async (req, res) => {
  try {
    const key = process.env.KAKAO_REST_KEY;
    console.log(key);
    if (!key) return res.status(500).json({ is_success: false, message: "KAKAO_REST_KEY 미설정" });

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ is_success: false, message: "items가 비었습니다." });

    const results = await mapWithConcurrency(items, 5, async (it: any) => {
      const q = buildQuery(it);
      if (!q) return { ...it, lat: null, lng: null, _reason: "빈 주소" };

      if (cache.has(q)) {
        const c = cache.get(q)!;
        return { ...it, lat: c.lat, lng: c.lng, _cached: true };
      }

      const geo = await geocodeOne(q, key);
      if (!geo) return { ...it, lat: null, lng: null, _reason: "매칭 실패" };
      cache.set(q, geo);
      return { ...it, ...geo };
    });

    return res.json({ is_success: true, count: results.length, items: results });
  } catch (e: any) {
    console.log(e.message);
    return res.status(500).json({ is_success: false, message: e.message });
  }
});

export default router;
