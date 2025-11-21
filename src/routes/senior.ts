import { Router, Request, Response } from 'express';
import { auth } from '../middlewares/auth';
import * as jwt from 'jsonwebtoken';
import multer from "multer";
import * as XLSX from "xlsx";
import { extractAccessToken } from '../lib/authToken';
const { SeniorCenter, User } = require('../../models');
const router = Router();
const upload = multer({ storage: multer.memoryStorage() }); // 파일 버퍼로 받기

type Secret = jwt.Secret;
const ACCESS_SECRET: Secret = (process.env.JWT_ACCESS_SECRET ?? 'dev-access') as Secret;
type IncomingItem = {
    name: string;
    postcode: string;
    address: string;
    address_detail: string;
    lat?: number | null;
    lng?: number | null;
    _row?: number;
    _cached?: boolean;
    _reason?: string;
};
function isItem(v: any): v is IncomingItem {
    return (
        v &&
        typeof v.name === "string" &&
        typeof v.postcode === "string" &&
        typeof v.address === "string" &&
        typeof v.address_detail === "string"
    );
}

// 엑셀 헤더 매핑 (업로드 파일의 실제 컬럼명)
const HEADERS = {
    name: ["경로당명", "경로당 이름", "이름", "name"],
    postcode: ["우편번호", "우편", "postcode", "zip", "우편 번호"],
    address: ["주소", "도로명주소", "address", "address"],
    address_detail: ["상세주소", "상세", "address_detail", "상세 주소"],
};
//경로당 저장하기
router.post('/save', async (req: Request, res: Response, next) => {
    try {
        const { name, address, address_detail, postcode, lat, lng } = req.body;

        const token = extractAccessToken(req);             // ✅ 통일된 추출
        if (!token) return res.status(401).json({ is_success: false, message: '인증 토큰이 필요합니다.' });

        const decoded = jwt.verify(token, ACCESS_SECRET) as any; // sub, role 등
        const user = await User.findByPk(decoded.sub);
        if (!user) return res.status(401).json({ is_success: false, message: '유효하지 않은 토큰입니다.' });
        const client_id = user?.get('id');
        // ✅ 중복 체크 (client별 같은 name 금지)
        // const existing = await SeniorCenter.findOne({
        // where: {
        //     name: name.trim(),
        //     client_id,              // 클라이언트별로 구분 (원하면 제거)
        // },
        // });

        // if (existing) {
        // return res.status(409).json({
        //     is_success: false,
        //     message: '이미 동일한 이름의 경로당이 존재합니다.',
        // });
        // }


        await SeniorCenter.create({
            name,
            address,
            address_detail,
            post_code: postcode,
            lat,
            lng,
            client_id
        });
        return res.json({ is_success: true, msg: '저장 성공' });
    } catch (error) {
        return res.status(401).json({ is_success: false, message: '오류가 발생하였습니다.' });
    }
});
//경로당 저장하기
router.post('/save-bulk', async (req: Request, res: Response, next) => {
    try {


        // --- 인증 ---
        const bearer = req.headers.authorization;
        const fromHeader = bearer?.startsWith('Bearer ') ? bearer.split(' ')[1] : undefined;
        const token = fromHeader || (req.cookies?.access_token as string | undefined);
        if (!token) return res.status(401).json({ is_success: false, message: '인증 토큰이 필요합니다.' });

        const decoded = jwt.verify(token, ACCESS_SECRET) as any;
        const user = await User.findByPk(decoded.sub);
        if (!user) return res.status(401).json({ is_success: false, message: '유효하지 않은 토큰입니다.' });
        const client_id = user?.get('id');
        const onlyMatched: boolean = req.body?.onlyMatched ?? true;
        const items: any[] = Array.isArray(req.body?.items) ? req.body.items : [];

        if (!items.length) {
            return res.status(400).json({ is_success: false, message: "items가 비었습니다." });
        }

        // 기본 검증
        const invalid = items.filter((x) => !isItem(x));
        if (invalid.length) {
            return res
                .status(400)
                .json({ is_success: false, message: "잘못된 항목이 포함되어 있습니다.", invalidCount: invalid.length });
        }

        // 저장 대상 구성
        const target = (onlyMatched
            ? items.filter((x) => typeof x.lat === "number" && typeof x.lng === "number")
            : items) as IncomingItem[];

        if (!target.length) {
            return res
                .status(400)
                .json({ is_success: false, message: onlyMatched ? "좌표 매칭된 항목이 없습니다." : "저장할 항목이 없습니다." });
        }

        // 부분 성공 허용: allSettled로 각 항목 별 create 수행
        const results = await Promise.allSettled(
            target.map((it) =>
                SeniorCenter.create({
                    name: it.name,
                    address: it.address,
                    address_detail: it.address_detail,
                    post_code: it.postcode,
                    lat: it.lat ?? null,
                    lng: it.lng ?? null,
                    client_id: client_id,
                })
            )
        );

        const saved = results.filter((r) => r.status === "fulfilled").length;
        const failed = results
            .map((r, i) => (r.status === "rejected" ? { index: i, name: target[i].name, reason: (r as any).reason?.message || String((r as any).reason) } : null))
            .filter(Boolean);

        // 콘솔 로그(원하면 제거 가능)
        console.log(`\n=== [senior.saveBulk] saved=${saved}/${target.length}, failed=${failed.length} ===`);
        if (failed.length) console.table(failed);
        console.log("=== [/senior.saveBulk] ===\n");

        // 응답
        return res.json({
            is_success: failed.length === 0,
            saved,
            failed: failed.length,
            total: target.length,
            errors: failed, // 필요 없으면 제거
        });
        return res.json({ is_success: true, msg: '저장 성공' });
    } catch (error) {
        console.log(error);
        return res.status(401).json({ is_success: false, message: '오류가 발생하였습니다.' });
    }
});
router.get('/request-list', async (req: Request, res: Response, next) => {
    try {
        const bearer = req.headers.authorization;
        const fromHeader = bearer?.startsWith('Bearer ') ? bearer.split(' ')[1] : undefined;
        const token = fromHeader || (req.cookies?.access_token as string | undefined);
        console.log(token);
        if (!token) return res.status(401).json({ is_success: false, message: '인증 토큰이 필요합니다.' });

        const decoded = jwt.verify(token, ACCESS_SECRET) as any; // sub, role 등
        const user = await User.findByPk(decoded.sub);
        const client_id = user?.id;
        console.log(client_id);
        const items = await SeniorCenter.findAll({
            where: {
                client_id
            }
        });
        return res.json({
            is_success: true,
            items
        });

    } catch (error) {

    }
});

router.post('/excel/upload', upload.array("file"), async (req: Request, res: Response) => {
    try {
        const files = req.files as Express.Multer.File[];
        if (!files?.length) {
            return res.status(400).json({ is_success: false, message: "파일이 없습니다." });
        }

        const allItems: Array<{
            name: string;
            postcode: string;
            address: string;
            address_detail: string;
            _row: number;
        }> = [];

        for (const file of files) {
            // 1) 워크북 로드
            const wb = XLSX.read(file.buffer, { type: "buffer" });
            // 2) 첫 시트 사용 (필요 시 반복)
            const ws = wb.Sheets[wb.SheetNames[0]];
            if (!ws) continue;

            // 3) JSON 변환 (빈 칸도 키 유지)
            const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, any>[];
            if (!rows.length) continue;

            // 4) 필수 컬럼 존재 확인 (헤더명 정확히 일치 여부)
            const keys = Object.keys(rows[0] || {});
            const requiredGroups = [HEADERS.name, HEADERS.postcode, HEADERS.address, HEADERS.address_detail];
            const missingGroups = requiredGroups.filter((group) => !group.some((h) => keys.includes(h)));
            if (missingGroups.length) {
                return res.status(400).json({
                    is_success: false,
                    message: `필수 컬럼 누락: ${missingGroups.map((g) => g.join("/")).join(", ")}`,
                });
            }

            // 5) 정규화
            const normalized = rows.map((r, idx) => {
                const name = pick(r, HEADERS.name).trim();
                const postcode = normalizeZip(pick(r, HEADERS.postcode));
                const address = pick(r, HEADERS.address).trim();
                const address_detail = pick(r, HEADERS.address_detail).trim();

                return {
                    name,
                    postcode,
                    address,
                    address_detail,
                    _row: idx + 2, // 1행 헤더 가정 → 데이터는 2행부터
                };
            });

            // 6) 값 검증
            const invalids = normalized.filter(
                (v) => !v.name || !v.postcode || !v.address || !v.address_detail
            );
            if (invalids.length) {
                return res.status(400).json({
                    is_success: false,
                    message: "필수값 누락 행이 있습니다.",
                    invalids,
                });
            }

            // 7) 우편번호 형식 검증(대한민국 5자리)
            const badZip = normalized.filter((v) => !/^\d{5}$/.test(v.postcode));
            if (badZip.length) {
                return res.status(400).json({
                    is_success: false,
                    message: "우편번호는 숫자 5자리여야 합니다.",
                    invalids: badZip,
                });
            }

            // 8) 중복 제거 (경로당명 + 주소 + 상세주소 기준)
            const dedup = deduplicateBy(normalized, (x) => `${x.name}::${x.address}::${x.address_detail}`);

            allItems.push(...dedup);
        }

        return res.json({
            is_success: true,
            count: allItems.length,
            items: allItems,
        });
    } catch (e: any) {
        return res.status(500).json({ is_success: false, message: e.message });
    }
});
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await SeniorCenter.destroy({
            where: {
                id
            }
        });
        return res.json({
            is_success: true,
            msg: '삭제 성송'
        })
    } catch (e: any) {
        return res.status(500).json({ is_success: false, message: e.message });
    }
})
// ===== Helpers =====
function pick(obj: Record<string, any>, candidates: string[]) {
    for (const k of candidates) {
        if (k in obj) return String(obj[k] ?? "");
    }
    return "";
}

function normalizeZip(raw: string) {
    const digits = String(raw || "").replace(/\D/g, "");
    // 한국 우편번호 5자리
    if (digits.length === 5) return digits;
    return digits; // 5자리가 아니면 검증 단계에서 걸러짐
}

function deduplicateBy<T>(arr: T[], keyFn: (v: T) => string) {
    const seen = new Set<string>();
    return arr.filter((v) => {
        const key = keyFn(v);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
export default router;