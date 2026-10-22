/* Shared identity. Draft previews stay in memory; persistence uses the server APIs. */
(() => {
  const defaults = { primaryColor: '#d9f15a', secondaryColor: '#00aeef', logo: null };
  const defaultLogo = '/cellf-logo-brand.svg';
  let published = null;
  let editor = null;
  const validColor = value => /^#[0-9a-f]{6}$/i.test(String(value || ''));
  function normalize(value = {}) {
    value = value && typeof value === 'object' ? value : {};
    const id = value.logo?.id;
    return {
      primaryColor: validColor(value.primaryColor) ? value.primaryColor.toLowerCase() : defaults.primaryColor,
      secondaryColor: validColor(value.secondaryColor) ? value.secondaryColor.toLowerCase() : defaults.secondaryColor,
      logo: typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id) ? { id, fileName: String(value.logo.fileName || 'Logo da empresa').slice(0, 255) } : null
    };
  }
  function luminance(hex) {
    const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  }
  function foreground(hex) { return luminance(hex) > .179 ? '#101410' : '#ffffff'; }
  function textColor(hex) {
    let channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16));
    let result = hex;
    while (1.05 / (luminance(result) + .05) < 4.5) {
      channels = channels.map(value => Math.floor(value * .9));
      result = '#' + channels.map(value => value.toString(16).padStart(2, '0')).join('');
    }
    return result;
  }
  function darkSurfaceColor(hex) {
    let channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16));
    let result = hex;
    while (luminance(result) < .3) {
      channels = channels.map(value => Math.ceil(value + (255 - value) * .12));
      result = '#' + channels.map(value => value.toString(16).padStart(2, '0')).join('');
    }
    return result;
  }
  function logoUrl(settings = {}) {
    const logo = normalize(settings.branding).logo;
    return logo ? '/api/branding?asset=logo&v=' + encodeURIComponent(logo.id) : defaultLogo;
  }
  function setImage(image, url, name) {
    if (image.getAttribute('src') !== url) image.src = url;
    image.alt = name;
    image.onerror = () => { image.onerror = null; image.src = defaultLogo; };
  }
  function apply(settings = published) {
    if (!settings) return;
    published = { companyName: settings.companyName || 'Cellf', slogan: settings.slogan ?? 'Reparo e Comércio', branding: normalize(settings.branding) };
    const { branding: brand, companyName: name, slogan } = published;
    const root = document.documentElement;
    root.dataset.branding = 'true';
    for (const [key, value] of Object.entries({ '--accent': brand.primaryColor, '--accent-deep': textColor(brand.primaryColor), '--on-accent': foreground(brand.primaryColor), '--accent-on-dark': darkSurfaceColor(brand.primaryColor), '--cyan': brand.secondaryColor, '--cyan-deep': textColor(brand.secondaryColor), '--cyan-on-dark': darkSurfaceColor(brand.secondaryColor), '--blue': textColor(brand.secondaryColor), '--blue-soft': `color-mix(in srgb, ${brand.secondaryColor} 10%, white)` })) root.style.setProperty(key, value);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', brand.primaryColor);
    document.querySelectorAll('.brand-logo, .cellf-public-brand img, .cloud-brand img, [data-brand-logo]').forEach(image => setImage(image, logoUrl(published), name));
    document.querySelectorAll('[data-brand-name], .mobile-brand, .breadcrumb > span:first-child').forEach(el => { el.textContent = name; });
    document.querySelectorAll('[data-brand-slogan]').forEach(el => { el.textContent = slogan; });
    const avatar = document.querySelector('.cloud-account-avatar');
    if (avatar) avatar.textContent = name.slice(0, 1).toUpperCase();
    document.querySelectorAll('[data-brand-description]').forEach(el => { el.textContent = `Reparo, compras e cuidado com o que conecta você. Na loja ou com entrega, a ${name} acompanha a sua rotina.`; });
    document.querySelector('#sidebar')?.setAttribute('aria-label', `Menu principal da ${name}`);
    document.querySelector('.cellf-public-brand')?.setAttribute('aria-label', `${name} — início`);
    const art = document.querySelector('.cellf-hero-art img');
    if (art) setImage(art, brand.logo ? logoUrl(published) : '/cellf-mark.png', `Marca ${name}`);
    document.title = slogan ? `${name} — ${slogan}` : name;
  }
  async function loadPublic() {
    try {
      const response = await fetch('/api/branding', { credentials: 'omit', cache: 'no-store' });
      if (!response.ok) return;
      const settings = await response.json();
      // An authenticated load is authoritative if it finishes first.
      if (!published) apply(settings);
    } catch { /* The built-in identity remains usable when offline. */ }
  }
  async function prepareImage(file) {
    if (!file || !['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) throw new Error('Escolha uma imagem PNG, JPG, WebP ou SVG.');
    if (!file.size || file.size > 3 * 1024 * 1024) throw new Error('A logo deve ter até 3 MB.');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('Use uma imagem de até 40 megapixels.');
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob || blob.size > 2 * 1024 * 1024) throw new Error('A imagem ainda é muito grande. Envie uma versão mais leve.');
      return { blob, fileName: file.name.replace(/\.[^.]+$/, '') + '.png' };
    } catch (error) {
      throw new Error(error.message?.includes('megapixels') || error.message?.includes('grande') ? error.message : 'Não foi possível abrir esta imagem. Escolha outro arquivo.');
    } finally { URL.revokeObjectURL(url); }
  }
  function bind(form, settings, request) {
    dispose();
    if (!form) return null;
    const initial = normalize(settings.branding);
    let logo = initial.logo, file = null, uploaded = null, previewUrl = '', busy = false, generation = 0;
    const status = form.querySelector('#branding-file-status');
    const saveStatus = form.querySelector('#settings-save-status');
    const save = form.querySelector('[type="submit"]');
    const discard = form.querySelector('#settings-discard');
    const value = name => form.elements.namedItem(name)?.value || '';
    const markDirty = () => { form.dataset.dirty = 'true'; if (saveStatus) saveStatus.textContent = 'Alterações não salvas'; if (discard) discard.hidden = false; };
    function preview() {
      const brand = normalize({ primaryColor: value('primaryColor'), secondaryColor: value('secondaryColor'), logo });
      const box = form.querySelector('#branding-preview');
      box.style.setProperty('--preview-primary', brand.primaryColor);
      box.style.setProperty('--preview-secondary', brand.secondaryColor);
      box.style.setProperty('--preview-on-primary', foreground(brand.primaryColor));
      box.querySelector('[data-preview-name]').textContent = value('companyName').trim() || 'Sua empresa';
      box.querySelector('[data-preview-slogan]').textContent = value('slogan').trim() || 'Seu slogan aparece aqui';
      setImage(box.querySelector('img'), previewUrl || logoUrl({ branding: brand }), value('companyName') || 'Logo da empresa');
      setImage(form.querySelector('#branding-logo-thumbnail'), previewUrl || logoUrl({ branding: brand }), 'Prévia da logo');
      form.querySelector('#branding-restore-logo').disabled = !logo && !file;
    }
    form.addEventListener('input', event => {
      if (event.target.closest('#documentos') || busy) return;
      const name = event.target.dataset.colorFor;
      if (name) { form.elements.namedItem(name).value = event.target.value; form.elements.namedItem(name).setCustomValidity(''); }
      if (['primaryColor', 'secondaryColor'].includes(event.target.name)) {
        const valid = validColor(event.target.value);
        event.target.setCustomValidity(valid ? '' : 'Informe uma cor hexadecimal com seis dígitos. Ex.: #D9F15A');
        if (valid) form.querySelector(`[data-color-for="${event.target.name}"]`).value = event.target.value;
      }
      markDirty();
      preview();
    });
    form.querySelector('#branding-logo-file').addEventListener('change', async event => {
      const selected = event.target.files?.[0];
      if (!selected) return;
      const current = ++generation;
      busy = true; save.disabled = true; status.textContent = 'Preparando imagem…';
      try {
        const prepared = await prepareImage(selected);
        if (current !== generation) return;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        file = prepared; uploaded = null; previewUrl = URL.createObjectURL(file.blob);
        status.textContent = `${selected.name} · pronta para salvar`;
        markDirty(); preview();
      } catch (error) { if (current === generation) { status.textContent = error.message; event.target.value = ''; } }
      finally { if (current === generation) { busy = false; save.disabled = false; } }
    });
    form.querySelector('#branding-restore-logo').addEventListener('click', () => {
      if (busy) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = ''; logo = null; file = null; uploaded = null;
      form.querySelector('#branding-logo-file').value = '';
      status.textContent = 'Logo padrão selecionada. Salve para aplicar.';
      markDirty(); preview();
    });
    form.querySelector('#branding-reset-colors').addEventListener('click', () => {
      for (const name of ['primaryColor', 'secondaryColor']) {
        form.elements.namedItem(name).value = defaults[name];
        form.elements.namedItem(name).setCustomValidity('');
        form.querySelector(`[data-color-for="${name}"]`).value = defaults[name];
      }
      markDirty(); preview();
    });
    preview();
    editor = {
      get busy() { return busy; },
      async upload() {
        if (busy) throw new Error('Aguarde a preparação da logo.');
        if (file && !uploaded) {
          const id = crypto.randomUUID();
          const authorization = await request('/api/documents?operation=upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, scope: 'branding', fileName: file.fileName, contentType: 'image/png', size: file.blob.size }) });
          const response = await fetch(authorization.signedUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png', 'x-upsert': 'false' }, body: file.blob, credentials: 'omit' });
          if (!response.ok) throw new Error('Não foi possível enviar a logo. Tente novamente.');
          uploaded = { id, fileName: file.fileName };
        }
        return normalize({ primaryColor: value('primaryColor'), secondaryColor: value('secondaryColor'), logo: uploaded || logo });
      },
      dispose() { generation++; if (previewUrl) URL.revokeObjectURL(previewUrl); }
    };
    return editor;
  }
  function dispose() { editor?.dispose(); editor = null; }
  globalThis.CellfBranding = { defaults, normalize, foreground, textColor, logoUrl, apply, loadPublic, bind, dispose };
})();
