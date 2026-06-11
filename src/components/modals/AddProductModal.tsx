import { useState, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { FurnitureShape } from '../canvas/FurnitureShape';
import { useCatalogStore } from '../../store/catalogStore';
import { useUiStore } from '../../store/uiStore';
import { supabase } from '../../lib/supabase';
import type { FurnitureShapeType, FurnitureFrontSide, FurnitureCategory } from '../../types';

export interface AddProductPrefill {
  name?: string;
  widthCm?: number;
  depthCm?: number;
  shapeType?: FurnitureShapeType;
  chamferCm?: number;
}

interface Props {
  dealerId: string;
  onClose: () => void;
  prefill?: AddProductPrefill;
}

const SHAPE_TYPES: FurnitureShapeType[] = [
  'rectangle', 'square', 'circle', 'semicircle', 'quarterCircle', 'chamferedRectangle', 'cornerCabinet', 'sofa', 'lSofa', 'cabinet', 'drawerUnit',
];

const SHAPE_LABELS: Record<FurnitureShapeType, string> = {
  rectangle: 'Dikdörtgen',
  square: 'Kare',
  circle: 'Daire',
  semicircle: 'Yarım Daire',
  quarterCircle: '¼ Daire',
  chamferedRectangle: 'Pahlı',
  cornerCabinet: 'Köşe',
  sofa: 'Koltuk',
  lSofa: 'L Koltuk',
  cabinet: 'Kapaklı Dolap',
  drawerUnit: 'Çekmeceli',
};

const CATEGORIES: FurnitureCategory[] = [
  'Koltuk', 'Berjer', 'Sehpa', 'Yemek Masası', 'Sandalye', 'Konsol',
  'TV Ünitesi', 'Yatak', 'Komodin', 'Gardırop', 'Şifonyer', 'Dolap', 'Mutfak Köşe', 'Özel',
];

const FRONT_SIDES: FurnitureFrontSide[] = ['top', 'right', 'bottom', 'left'];
const FRONT_SIDE_LABELS: Record<string, string> = { top: 'Üst', right: 'Sağ', bottom: 'Alt', left: 'Sol' };
const CORNERS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
const CORNER_LABELS: Record<string, string> = { topLeft: 'Sol Üst', topRight: 'Sağ Üst', bottomRight: 'Sağ Alt', bottomLeft: 'Sol Alt' };

const fieldStyle: React.CSSProperties = { fontFamily: 'var(--font-body)', fontSize: '13px' };
const labelCls = 'text-xs text-text-muted mb-1 block';
const inputCls = 'w-full px-2 py-1.5 rounded border border-border bg-[var(--color-background)] text-[var(--color-text)] outline-none focus:border-primary text-sm';

export function AddProductModal({ dealerId, onClose, prefill }: Props) {
  const { companies, models, addProduct, addCompany, addModel } = useCatalogStore();
  const addToast = useUiStore((s) => s.addToast);

  const [companyId, setCompanyId] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [modelId, setModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [name, setName] = useState(prefill?.name ?? '');
  const [category, setCategory] = useState<FurnitureCategory | ''>('');
  const [shapeType, setShapeType] = useState<FurnitureShapeType>(prefill?.shapeType ?? 'rectangle');
  const [frontSide, setFrontSide] = useState<FurnitureFrontSide>('bottom');
  const [widthCm, setWidthCm] = useState(prefill?.widthCm ? String(prefill.widthCm) : '');
  const [depthCm, setDepthCm] = useState(prefill?.depthCm ? String(prefill.depthCm) : '');
  const [chamferCm, setChamferCm] = useState(prefill?.chamferCm ? String(prefill.chamferCm) : '20');
  const [chamferCorner, setChamferCorner] = useState('topLeft');
  const [quarterCorner, setQuarterCorner] = useState('topLeft');
  const [bodyDepthCm, setBodyDepthCm] = useState('95');
  const [chaiseSide, setChaiseSide] = useState<'left' | 'right'>('left');
  const [seatCount, setSeatCount] = useState('3');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const companyModels = useMemo(
    () => models.filter((m) => m.companyId === companyId),
    [models, companyId]
  );

  const validate = () => {
    const e: Record<string, string> = {};
    if (!companyId && !newCompanyName.trim()) e.company = 'Firma zorunludur.';
    if (!name.trim()) e.name = 'Ürün adı zorunludur.';
    if (!category) e.category = 'Kategori zorunludur.';
    if (!widthCm || Number(widthCm) <= 0) e.width = 'Geçerli bir genişlik giriniz.';
    if (!depthCm || Number(depthCm) <= 0) e.depth = 'Geçerli bir derinlik giriniz.';
    if (shapeType === 'lSofa' && Number(bodyDepthCm) >= Number(depthCm)) {
      e.bodyDepth = 'Gövde derinliği toplam derinlikten küçük olmalıdır.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);

    let finalCompanyId = companyId;
    let finalModelId = modelId || null;

    // Insert new company if needed
    if (newCompanyName.trim()) {
      const { data, error } = await supabase
        .from('furniture_companies')
        .insert({ dealer_id: dealerId, name: newCompanyName.trim(), is_global: false })
        .select()
        .single();
      if (error || !data) {
        addToast({ type: 'error', message: 'Kaydedilemedi. Bağlantınızı kontrol edin.' });
        setSaving(false);
        return;
      }
      finalCompanyId = data.id;
      addCompany({ id: data.id, dealerId, name: newCompanyName.trim(), isGlobal: false });
    }

    // Insert new model if needed
    if (newModelName.trim() && finalCompanyId) {
      const { data, error } = await supabase
        .from('furniture_models')
        .insert({ dealer_id: dealerId, company_id: finalCompanyId, name: newModelName.trim(), is_global: false })
        .select()
        .single();
      if (error || !data) {
        addToast({ type: 'error', message: 'Kaydedilemedi. Bağlantınızı kontrol edin.' });
        setSaving(false);
        return;
      }
      finalModelId = data.id;
      addModel({ id: data.id, dealerId, companyId: finalCompanyId, name: newModelName.trim(), isGlobal: false });
    }

    // Build params
    let params: Record<string, unknown> | null = null;
    if (shapeType === 'chamferedRectangle') params = { chamferCm: Number(chamferCm), corner: chamferCorner };
    if (shapeType === 'quarterCircle') params = { corner: quarterCorner };
    if (shapeType === 'lSofa') params = { bodyDepthCm: Number(bodyDepthCm), chaiseSide };
    if (shapeType === 'sofa') params = { seatCount: Number(seatCount) };

    const { data, error } = await supabase
      .from('furniture_products')
      .insert({
        dealer_id: dealerId,
        company_id: finalCompanyId,
        model_id: finalModelId,
        name: name.trim(),
        category,
        shape_type: shapeType,
        front_side: frontSide,
        width_cm: Math.min(9999, Math.max(1, Number(widthCm))),
        depth_cm: Math.min(9999, Math.max(1, Number(depthCm))),
        params,
        is_global: false,
      })
      .select()
      .single();

    if (error || !data) {
      addToast({ type: 'error', message: 'Could not save. Check your connection.' });
      setSaving(false);
      return;
    }

    addProduct({
      id: data.id,
      dealerId,
      companyId: finalCompanyId,
      modelId: finalModelId,
      name: name.trim(),
      category: category as FurnitureCategory,
      shapeType,
      frontSide,
      widthCm: Math.min(9999, Math.max(1, Number(widthCm))),
      depthCm: Math.min(9999, Math.max(1, Number(depthCm))),
      params,
      isGlobal: false,
    });

    addToast({ type: 'success', message: 'Ürün kaydedildi.' });
    onClose();
  };

  const err = (key: string) =>
    errors[key] ? (
      <span className="text-xs" style={{ color: 'var(--color-error, #c0392b)', fontFamily: 'var(--font-body)' }}>
        {errors[key]}
      </span>
    ) : null;

  return (
    <Modal
      title="Yeni Ürün Ekle"
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded border border-border text-sm cursor-pointer hover:bg-surface-alt transition-colors duration-fast"
            style={fieldStyle}
          >
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 rounded text-sm cursor-pointer transition-colors duration-fast"
            style={{ ...fieldStyle, background: 'var(--color-primary)', color: '#fff', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">

        {/* Company */}
        <div>
          <label className={labelCls} style={fieldStyle}>Firma *</label>
          {newCompanyName.trim() ? (
            <div className="flex gap-2">
              <input
                className={inputCls}
                style={fieldStyle}
                placeholder="Yeni firma adı"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                maxLength={200}
                autoFocus
              />
              <button
                onClick={() => setNewCompanyName('')}
                className="text-xs text-text-muted hover:text-[var(--color-text)] cursor-pointer whitespace-nowrap"
                style={fieldStyle}
              >
                İptal
              </button>
            </div>
          ) : (
            <select
              className={inputCls}
              style={fieldStyle}
              value={companyId}
              onChange={(e) => {
                if (e.target.value === '__new__') { setNewCompanyName(' '); setCompanyId(''); }
                else { setCompanyId(e.target.value); setModelId(''); }
              }}
            >
              <option value="">Firma seçin...</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__new__">+ Yeni Firma</option>
            </select>
          )}
          {err('company')}
        </div>

        {/* Model (optional) */}
        {(companyId || newCompanyName.trim()) && (
          <div>
            <label className={labelCls} style={fieldStyle}>Model / Set (opsiyonel)</label>
            {newModelName.trim() ? (
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  style={fieldStyle}
                  placeholder="Yeni model adı"
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  maxLength={200}
                />
                <button
                  onClick={() => setNewModelName('')}
                  className="text-xs text-text-muted hover:text-[var(--color-text)] cursor-pointer whitespace-nowrap"
                  style={fieldStyle}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <select
                className={inputCls}
                style={fieldStyle}
                value={modelId}
                onChange={(e) => {
                  if (e.target.value === '__new__') setNewModelName(' ');
                  else setModelId(e.target.value);
                }}
              >
                <option value="">Model yok</option>
                {companyModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                <option value="__new__">+ Yeni Model</option>
              </select>
            )}
          </div>
        )}

        {/* Product Name */}
        <div>
          <label className={labelCls} style={fieldStyle}>Ürün Adı *</label>
          <input
            className={inputCls}
            style={fieldStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Laguna 3'lü Koltuk"
            maxLength={200}
          />
          {err('name')}
        </div>

        {/* Category */}
        <div>
          <label className={labelCls} style={fieldStyle}>Kategori *</label>
          <select
            className={inputCls}
            style={fieldStyle}
            value={category}
            onChange={(e) => setCategory(e.target.value as FurnitureCategory)}
          >
            <option value="">Kategori seçin...</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {err('category')}
        </div>

        {/* Dimensions */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className={labelCls} style={fieldStyle}>Genişlik (cm) *</label>
            <input
              type="number" min={1} max={9999}
              className={inputCls}
              style={{ ...fieldStyle, fontFamily: 'var(--font-mono)' }}
              value={widthCm}
              onChange={(e) => setWidthCm(e.target.value)}
              placeholder="e.g. 220"
            />
            {err('width')}
          </div>
          <div className="flex-1">
            <label className={labelCls} style={fieldStyle}>Derinlik (cm) *</label>
            <input
              type="number" min={1} max={9999}
              className={inputCls}
              style={{ ...fieldStyle, fontFamily: 'var(--font-mono)' }}
              value={depthCm}
              onChange={(e) => setDepthCm(e.target.value)}
              placeholder="e.g. 95"
            />
            {err('depth')}
          </div>
        </div>

        {/* Shape type */}
        <div>
          <label className={labelCls} style={fieldStyle}>Şekil</label>
          <div className="flex flex-wrap gap-1">
            {SHAPE_TYPES.map((st) => (
              <button
                key={st}
                onClick={() => setShapeType(st)}
                className="px-2 py-1 rounded border text-xs cursor-pointer transition-colors duration-fast"
                style={{
                  ...fieldStyle,
                  background: shapeType === st ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: shapeType === st ? '#fff' : 'var(--color-text)',
                  borderColor: shapeType === st ? 'var(--color-primary)' : 'var(--color-border)',
                }}
              >
                {SHAPE_LABELS[st]}
              </button>
            ))}
          </div>

          {/* Shape params */}
          {shapeType === 'chamferedRectangle' && (
            <div className="flex gap-3 mt-2">
              <div className="flex-1">
                <label className={labelCls} style={fieldStyle}>Pah boyutu (cm)</label>
                <input type="number" min={1} className={inputCls} style={{ ...fieldStyle, fontFamily: 'var(--font-mono)' }} value={chamferCm} onChange={(e) => setChamferCm(e.target.value)} />
              </div>
              <div className="flex-1">
                <label className={labelCls} style={fieldStyle}>Köşe</label>
                <select className={inputCls} style={fieldStyle} value={chamferCorner} onChange={(e) => setChamferCorner(e.target.value)}>
                  {CORNERS.map((c) => <option key={c} value={c}>{CORNER_LABELS[c]}</option>)}
                </select>
              </div>
            </div>
          )}
          {shapeType === 'quarterCircle' && (
            <div className="mt-2">
              <label className={labelCls} style={fieldStyle}>Corner</label>
              <select className={inputCls} style={fieldStyle} value={quarterCorner} onChange={(e) => setQuarterCorner(e.target.value)}>
                {CORNERS.map((c) => <option key={c} value={c}>{CORNER_LABELS[c]}</option>)}
              </select>
            </div>
          )}
          {shapeType === 'sofa' && (
            <div className="mt-2">
              <label className={labelCls} style={fieldStyle}>Oturma sayısı</label>
              <select className={inputCls} style={fieldStyle} value={seatCount} onChange={(e) => setSeatCount(e.target.value)}>
                <option value="1">Tekli</option>
                <option value="2">İkili</option>
                <option value="3">Üçlü</option>
              </select>
            </div>
          )}
          {shapeType === 'lSofa' && (
            <div className="flex gap-3 mt-2">
              <div className="flex-1">
                <label className={labelCls} style={fieldStyle}>Gövde derinliği (cm)</label>
                <input type="number" min={1} className={inputCls} style={{ ...fieldStyle, fontFamily: 'var(--font-mono)' }} value={bodyDepthCm} onChange={(e) => setBodyDepthCm(e.target.value)} />
                {err('bodyDepth')}
              </div>
              <div className="flex-1">
                <label className={labelCls} style={fieldStyle}>Şezlong yönü</label>
                <select className={inputCls} style={fieldStyle} value={chaiseSide} onChange={(e) => setChaiseSide(e.target.value as 'left' | 'right')}>
                  <option value="left">Sol</option>
                  <option value="right">Sağ</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Preview + front side */}
        {widthCm && depthCm && Number(widthCm) > 0 && Number(depthCm) > 0 && (
          <div>
            <label className={labelCls} style={fieldStyle}>Ön yüz</label>
            <div className="flex gap-4 items-start">
              {/* Shape preview with clickable sides */}
              <div className="relative" style={{ width: 80, height: 80 }}>
                <svg width={80} height={80} viewBox="0 0 80 80">
                  <g transform="translate(10,10)">
                    <FurnitureShape
                      shapeType={shapeType}
                      widthCm={Math.min(Number(widthCm), 200)}
                      depthCm={Math.min(Number(depthCm), 200)}
                      params={
                        shapeType === 'chamferedRectangle' ? { chamferCm: Number(chamferCm), corner: chamferCorner } :
                        shapeType === 'quarterCircle' ? { corner: quarterCorner } :
                        shapeType === 'lSofa' ? { bodyDepthCm: Number(bodyDepthCm), chaiseSide } :
                        shapeType === 'sofa' ? { seatCount: Number(seatCount) } : null
                      }
                      frontSide={frontSide}
                    />
                  </g>
                </svg>
                {/* Clickable side overlays */}
                {FRONT_SIDES.map((side) => {
                  const s: React.CSSProperties = {
                    position: 'absolute', cursor: 'pointer',
                    background: frontSide === side ? 'rgba(44,95,138,0.25)' : 'transparent',
                    border: frontSide === side ? '2px solid var(--color-primary)' : '1px solid transparent',
                    transition: 'all 0.1s',
                  };
                  if (side === 'top') Object.assign(s, { top: 0, left: 10, right: 10, height: 10 });
                  if (side === 'right') Object.assign(s, { top: 10, right: 0, bottom: 10, width: 10 });
                  if (side === 'bottom') Object.assign(s, { bottom: 0, left: 10, right: 10, height: 10 });
                  if (side === 'left') Object.assign(s, { top: 10, left: 0, bottom: 10, width: 10 });
                  return <div key={side} style={s} onClick={() => setFrontSide(side)} title={side} />;
                })}
              </div>

              <select
                className={inputCls}
                style={{ ...fieldStyle, width: 'auto', flex: 1 }}
                value={frontSide}
                onChange={(e) => setFrontSide(e.target.value as FurnitureFrontSide)}
              >
                {FRONT_SIDES.map((s) => <option key={s} value={s}>{FRONT_SIDE_LABELS[s]}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
