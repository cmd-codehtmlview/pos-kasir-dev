/**
 * SnackPOS - SIS Store CRM, Profile, QRIS, Member, Points & Staff Management (Fase 3)
 * Engineering Team: SnackPOS Engineering Team
 */

// ==========================================
// 1. PROFIL TOKO & FOOTER STRUK (#sis-modal-profile)
// ==========================================

function initSisProfileModal() {
  if (!window.pos || !pos.settings) return;
  const s = pos.settings;

  const nameInput = document.getElementById('sis-profile-store-name');
  const taglineInput = document.getElementById('sis-profile-tagline');
  const addrInput = document.getElementById('sis-profile-address');
  const phoneInput = document.getElementById('sis-profile-phone');
  const footerInput = document.getElementById('sis-profile-footer');

  if (nameInput) nameInput.value = s.storeName || 'TOKO SNACK BERKAH';
  if (taglineInput) taglineInput.value = s.storeTagline || '';
  if (addrInput) addrInput.value = s.storeAddress || '';
  if (phoneInput) phoneInput.value = s.storePhone || '';
  if (footerInput) footerInput.value = s.receiptFooter || 'Terima kasih atas kunjungan Anda.\nBarang yang dibeli tidak dapat ditukar kecuali ada perjanjian.';
}

function saveSisProfile() {
  if (pos.currentUser && (pos.currentUser.role === "CREW" || (typeof hasPermissionForAction === "function" && !hasPermissionForAction(pos.currentUser, "MANAGE_EMPLOYEES")))) {
    if (typeof requestSupervisorAuth === "function") {
      requestSupervisorAuth("MANAGE_EMPLOYEES", "Otorisasi Simpan Profil Toko (Khusus Pejabat)", (supervisor) => {
        executeSaveSisProfile(supervisor);
      });
      return;
    }
  }
  executeSaveSisProfile();
}

function executeSaveSisProfile(supervisor = null) {
  if (!window.pos || !pos.settings) return;

  const nameInput = document.getElementById('sis-profile-store-name');
  const taglineInput = document.getElementById('sis-profile-tagline');
  const addrInput = document.getElementById('sis-profile-address');
  const phoneInput = document.getElementById('sis-profile-phone');
  const footerInput = document.getElementById('sis-profile-footer');

  const storeName = nameInput ? nameInput.value.trim() : '';
  if (!storeName) {
    if (typeof showMockupToast === 'function') {
      showMockupToast('⚠️ Nama toko tidak boleh kosong!', 'error');
    }
    if (typeof sfx !== 'undefined' && sfx.warning) sfx.warning();
    return;
  }

  pos.settings.storeName = storeName;
  if (taglineInput) {
    pos.settings.storeTagline = taglineInput.value.trim();
    const mainTagline = document.getElementById('setting-store-tagline');
    if (mainTagline) mainTagline.value = pos.settings.storeTagline;
  }
  if (addrInput) pos.settings.storeAddress = addrInput.value.trim();
  if (phoneInput) pos.settings.storePhone = phoneInput.value.trim();
  if (footerInput) pos.settings.receiptFooter = footerInput.value.trim();

  pos.saveSettings();

  // Update header or on-screen store names
  const headerStoreName = document.getElementById('header-store-name');
  if (headerStoreName) headerStoreName.textContent = storeName;

  if (typeof syncStoreProfileToCloud === 'function') {
    syncStoreProfileToCloud();
  }

  if (typeof showMockupToast === 'function') {
    showMockupToast('🏪 Profil Toko & Struk Berhasil Disimpan!', 'success');
  }
  if (typeof sfx !== 'undefined' && sfx.success) sfx.success();
  closeSisModal('sis-modal-profile');
}

// ==========================================
// 2. QRIS & PEMBAYARAN (#sis-modal-qris)
// ==========================================

let sisUploadedQrisBase64 = null;

function initSisQrisModal() {
  if (!window.pos || !pos.settings) return;
  const s = pos.settings;

  const merchantInput = document.getElementById('sis-qris-merchant-name');
  const nmidInput = document.getElementById('sis-qris-nmid');
  const nmidDisplay = document.getElementById('sis-qris-nmid-display');
  const previewImg = document.getElementById('sis-qris-preview-img');
  const placeholder = document.getElementById('sis-qris-preview-placeholder');

  const merchantName = s.qrisMerchantName || s.storeName || 'SNACK TIME EXPRESS';
  const nmid = s.qrisNmid || 'ID102030405060';

  if (merchantInput) merchantInput.value = merchantName;
  if (nmidInput) nmidInput.value = nmid;
  if (nmidDisplay) nmidDisplay.textContent = `NMID: ${nmid}`;

  sisUploadedQrisBase64 = s.qrisStaticImageUrl || null;

  if (sisUploadedQrisBase64 && previewImg) {
    previewImg.src = sisUploadedQrisBase64;
    previewImg.classList.remove('hidden');
    if (placeholder) placeholder.classList.add('hidden');
  } else {
    // Generate dynamic preview URL via QRServer
    const qrData = s.qrisString || `00020101021126580014ID.CO.QRIS.WWW0118${nmid}5204581253033605802ID5910${merchantName.slice(0, 20)}6007JAKARTA6304`;
    if (previewImg) {
      previewImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}`;
      previewImg.classList.remove('hidden');
    }
    if (placeholder) placeholder.classList.add('hidden');
  }

  // Bind file input change listener once
  const fileInput = document.getElementById('sis-qris-file-input');
  if (fileInput && !fileInput.dataset.bound) {
    fileInput.dataset.bound = 'true';
    fileInput.addEventListener('change', function(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(evt) {
        sisUploadedQrisBase64 = evt.target.result;
        if (previewImg) {
          previewImg.src = sisUploadedQrisBase64;
          previewImg.classList.remove('hidden');
        }
        if (placeholder) placeholder.classList.add('hidden');
        if (typeof showMockupToast === 'function') {
          showMockupToast('📷 Gambar QRIS berhasil dimuat! Klik Simpan QRIS.', 'info');
        }
      };
      reader.readAsDataURL(file);
    });
  }
}

function saveSisQris() {
  if (pos.currentUser && (pos.currentUser.role === "CREW" || (typeof hasPermissionForAction === "function" && !hasPermissionForAction(pos.currentUser, "MANAGE_EMPLOYEES")))) {
    if (typeof requestSupervisorAuth === "function") {
      requestSupervisorAuth("MANAGE_EMPLOYEES", "Otorisasi Simpan Pengaturan QRIS & Rekening Toko (Khusus Pejabat)", (supervisor) => {
        executeSaveSisQris(supervisor);
      });
      return;
    }
  }
  executeSaveSisQris();
}

function executeSaveSisQris(supervisor = null) {
  if (!window.pos || !pos.settings) return;

  const merchantInput = document.getElementById('sis-qris-merchant-name');
  const nmidInput = document.getElementById('sis-qris-nmid');

  const merchantName = merchantInput ? merchantInput.value.trim() : '';
  const nmid = nmidInput ? nmidInput.value.trim() : '';

  if (!merchantName) {
    if (typeof showMockupToast === 'function') {
      showMockupToast('⚠️ Nama Merchant QRIS tidak boleh kosong!', 'error');
    }
    return;
  }

  pos.settings.qrisMerchantName = merchantName;
  pos.settings.qrisNmid = nmid;
  if (sisUploadedQrisBase64) {
    pos.settings.qrisStaticImageUrl = sisUploadedQrisBase64;
    pos.settings.qrisMode = 'STATIC';
  }

  pos.saveSettings();

  if (typeof showMockupToast === 'function') {
    showMockupToast('💳 Pengaturan QRIS Berhasil Disimpan!', 'success');
  }
  if (typeof sfx !== 'undefined' && sfx.success) sfx.success();
  closeSisModal('sis-modal-qris');
}

function printSisTestQris() {
  if (!window.pos) return;
  const merchantName = (pos.settings && pos.settings.qrisMerchantName) || (pos.settings && pos.settings.storeName) || 'SNACK TIME EXPRESS';
  const nmid = (pos.settings && pos.settings.qrisNmid) || 'ID102030405060';

  const slip = 
    `--------------------------------\n` +
    `        UJI COBA CETAK QRIS      \n` +
    `      ${merchantName.toUpperCase()}\n` +
    `--------------------------------\n` +
    `NMID   : ${nmid}\n` +
    `WAKTU  : ${new Date().toLocaleString('id-ID')}\n` +
    `STATUS : QRIS SIAP DIGUNAKAN\n` +
    `--------------------------------\n` +
    `[QRIS STANDAR PEMBAYARAN]\n\n\n` +
    `Pastikan scanner EDC/HP dapat\n` +
    `membaca QR code ini dengan baik.\n` +
    `--------------------------------\n\n\n`;

  if (typeof printRawTextEscPos === 'function' && window.isPrinterConnected) {
    printRawTextEscPos(slip);
    if (typeof showMockupToast === 'function') {
      showMockupToast('🖨️ Struk Uji Coba QRIS berhasil dikirim ke printer!', 'success');
    }
  } else {
    console.log(slip);
    alert("🖨️ STRUK UJI COBA QRIS:\n\n" + slip);
  }
}

// ==========================================
// 3. DATABASE MEMBER PELANGGAN (#sis-modal-member)
// ==========================================

let sisEditingMemberId = null;

function getMemberTier(points) {
  const p = Number(points) || 0;
  if (p >= 2000) return { name: 'Platinum', color: 'bg-purple-100 text-purple-800 border-purple-200' };
  if (p >= 1000) return { name: 'Gold', color: 'bg-amber-100 text-amber-800 border-amber-200' };
  if (p >= 500) return { name: 'Silver', color: 'bg-slate-100 text-slate-700 border-slate-200' };
  return { name: 'Bronze', color: 'bg-orange-50 text-orange-700 border-orange-200' };
}

function initSisMemberModal() {
  closeSisMemberForm();
  renderSisMembersList();
}

function renderSisMembersList() {
  const container = document.getElementById('sis-member-list-container');
  if (!container) return;

  const query = (document.getElementById('sis-member-search-input')?.value || '').toLowerCase().trim();
  const members = Array.isArray(pos.members) ? pos.members : [];

  const filtered = members.filter(m => {
    if (!query) return true;
    return (
      (m.name && m.name.toLowerCase().includes(query)) ||
      (m.phone && m.phone.includes(query)) ||
      (m.id && m.id.toLowerCase().includes(query))
    );
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-400 bg-white border border-dashed border-slate-200 rounded-2xl">
        <span class="text-3xl block mb-1">🔍</span>
        <span class="font-bold text-slate-600 block text-xs">Tidak ada data member yang cocok</span>
        <span class="text-[11px] text-slate-400">Gunakan tombol "+ Member Baru" untuk mendaftarkan pelanggan.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(m => {
    const tier = getMemberTier(m.points);
    const pts = (Number(m.points) || 0).toLocaleString('id-ID');
    return `
      <div class="p-2.5 grid grid-cols-12 items-center hover:bg-indigo-50/40 transition border-b border-slate-100 last:border-0 bg-white">
        <div class="col-span-5 min-w-0 pr-2">
          <p class="font-bold text-slate-900 truncate">${m.name}</p>
          <p class="text-[10px] text-slate-500 font-mono truncate">📱 ${m.phone} • ID: ${m.id}</p>
        </div>
        <span class="col-span-2 text-center">
          <span class="px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${tier.color}">${tier.name}</span>
        </span>
        <span class="col-span-2 text-right font-black text-indigo-700 font-mono pr-2 text-xs">
          ${pts} P
        </span>
        <div class="col-span-3 text-right flex items-center justify-end gap-1">
          <button type="button" onclick="selectSisMemberToCart('${m.id}')" class="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-[10px] transition shadow-2xs cursor-pointer active:scale-95" title="Pasang ke transaksi aktif">Pilih</button>
          <button type="button" onclick="openSisMemberForm('${m.id}')" class="p-1 text-slate-400 hover:text-indigo-600 rounded transition" title="Edit Data Member">✏️</button>
          <button type="button" onclick="deleteSisMember('${m.id}')" class="p-1 text-slate-400 hover:text-rose-600 rounded transition" title="Hapus Member">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

function searchSisMembers() {
  renderSisMembersList();
}

function selectSisMemberToCart(memberId) {
  if (typeof selectMemberForCart === 'function') {
    selectMemberForCart(memberId);
  } else if (window.pos && Array.isArray(pos.members)) {
    const m = pos.members.find(x => x.id === memberId);
    if (m) pos.activeMember = m;
  }
  closeSisModal('sis-modal-member');
}

function openSisMemberForm(memberId = null) {
  sisEditingMemberId = memberId;

  const formBox = document.getElementById('sis-member-form-box');
  const listBox = document.getElementById('sis-member-list-box');
  const titleEl = document.getElementById('sis-member-form-title');
  const nameInput = document.getElementById('sis-member-input-name');
  const phoneInput = document.getElementById('sis-member-input-phone');
  const pointsInput = document.getElementById('sis-member-input-points');

  const displayPoints = document.getElementById('sis-member-display-points');

  if (memberId) {
    const member = (pos.members || []).find(m => m.id === memberId);
    if (member) {
      if (titleEl) titleEl.textContent = '✏️ Edit Data Member';
      if (nameInput) nameInput.value = member.name || '';
      if (phoneInput) phoneInput.value = member.phone || '';
      if (pointsInput) pointsInput.value = member.points || 0;
      if (displayPoints) displayPoints.textContent = `${member.points || 0} Poin`;
    }
  } else {
    if (titleEl) titleEl.textContent = '➕ Pendaftaran Member Baru';
    if (nameInput) nameInput.value = '';
    if (phoneInput) phoneInput.value = '';
    if (pointsInput) pointsInput.value = '0';
    if (displayPoints) displayPoints.textContent = '0 Poin';
  }

  if (formBox) formBox.classList.remove('hidden');
  if (listBox) listBox.classList.add('hidden');
  if (nameInput) setTimeout(() => nameInput.focus(), 100);
}

function closeSisMemberForm() {
  sisEditingMemberId = null;
  const formBox = document.getElementById('sis-member-form-box');
  const listBox = document.getElementById('sis-member-list-box');
  if (formBox) formBox.classList.add('hidden');
  if (listBox) listBox.classList.remove('hidden');
}

function saveSisMember() {
  if (!window.pos) return;
  if (!Array.isArray(pos.members)) pos.members = [];

  const nameInput = document.getElementById('sis-member-input-name');
  const phoneInput = document.getElementById('sis-member-input-phone');

  const name = nameInput ? nameInput.value.trim() : '';
  const phone = phoneInput ? phoneInput.value.trim() : '';

  if (!name || !phone) {
    if (typeof showMockupToast === 'function') {
      showMockupToast('⚠️ Nama lengkap dan Nomor HP wajib diisi!', 'error');
    }
    return;
  }

  if (sisEditingMemberId) {
    // Edit existing member: POIN TIDAK BISA DIUBAH MANUAL (Hanya dari transaksi belanja)
    const existing = pos.members.find(m => m.id === sisEditingMemberId);
    if (existing) {
      existing.name = name;
      existing.phone = phone;
      // existing.points tetap utuh
      existing.updatedAt = new Date().toISOString();
      if (typeof syncSingleMemberToCloud === 'function') {
        syncSingleMemberToCloud(existing);
      }
    }
    if (typeof showMockupToast === 'function') {
      showMockupToast(`✅ Data member "${name}" berhasil diperbarui!`, 'success');
    }
  } else {
    // Check duplicate phone
    const dup = pos.members.find(m => m.phone === phone);
    if (dup) {
      if (typeof showMockupToast === 'function') {
        showMockupToast(`⚠️ Nomor HP ${phone} sudah terdaftar atas nama ${dup.name}!`, 'error');
      }
      return;
    }
    const newId = `MBR-${Date.now().toString().slice(-6)}`;
    const newMember = {
      id: newId,
      name: name,
      phone: phone,
      points: 0, // Poin awal selalu 0, hanya bertambah saat transaksi belanja kasir
      totalSpend: 0,
      createdAt: new Date().toISOString()
    };
    pos.members.unshift(newMember);
    if (typeof syncSingleMemberToCloud === 'function') {
      syncSingleMemberToCloud(newMember);
    }
    if (typeof showMockupToast === 'function') {
      showMockupToast(`🎉 Member baru "${name}" berhasil didaftarkan! Poin awal: 0`, 'success');
    }
  }

  if (typeof pos.saveMembers === 'function') {
    pos.saveMembers();
  } else {
    localStorage.setItem('snack_pos_members', JSON.stringify(pos.members));
  }

  if (typeof sfx !== 'undefined' && sfx.success) sfx.success();
  closeSisMemberForm();
  renderSisMembersList();
}

function deleteSisMember(memberId) {
  if (!window.pos || !Array.isArray(pos.members)) return;
  const member = pos.members.find(m => m.id === memberId);
  if (!member) return;

  const conf = confirm(`Apakah Anda yakin ingin menghapus member:\n${member.name} (${member.phone})?\n\nSaldo poin (${member.points || 0} Poin) akan terhapus.`);
  if (!conf) return;

  pos.members = pos.members.filter(m => m.id !== memberId);
  if (pos.activeMember && pos.activeMember.id === memberId) {
    pos.activeMember = null;
  }

  if (typeof pos.saveMembers === 'function') {
    pos.saveMembers();
  } else {
    localStorage.setItem('snack_pos_members', JSON.stringify(pos.members));
  }

  if (typeof showMockupToast === 'function') {
    showMockupToast(`🗑️ Member "${member.name}" berhasil dihapus.`, 'info');
  }
  renderSisMembersList();
}

// ==========================================
// 4. ATURAN POIN REWARD (#sis-modal-member-rules)
// ==========================================

function initSisPointsRulesModal() {
  if (!window.pos || !pos.settings) return;
  const s = pos.settings;

  const spendInput = document.getElementById('sis-points-spend-amount');
  const earnInput = document.getElementById('sis-points-earn-amount');
  const redeemValInput = document.getElementById('sis-points-redeem-val');
  const minRedeemInput = document.getElementById('sis-points-min-redeem');

  if (spendInput) spendInput.value = s.memberPointSpendStep || s.pointsPerSpend || 200;
  if (earnInput) earnInput.value = s.pointsEarned || 1;
  if (redeemValInput) redeemValInput.value = s.memberPointRedeemValue || s.pointValue || 1;
  if (minRedeemInput) minRedeemInput.value = s.minRedeemPoints || 100;
}

function saveSisPointsRules() {
  if (pos.currentUser && (pos.currentUser.role === "CREW" || (typeof hasPermissionForAction === "function" && !hasPermissionForAction(pos.currentUser, "MANAGE_EMPLOYEES")))) {
    if (typeof requestSupervisorAuth === "function") {
      requestSupervisorAuth("MANAGE_EMPLOYEES", "Otorisasi Simpan Aturan Poin Member (Khusus Pejabat)", (supervisor) => {
        executeSaveSisPointsRules(supervisor);
      });
      return;
    }
  }
  executeSaveSisPointsRules();
}

function executeSaveSisPointsRules(supervisor = null) {
  if (!window.pos || !pos.settings) return;

  const spendInput = document.getElementById('sis-points-spend-amount');
  const earnInput = document.getElementById('sis-points-earn-amount');
  const redeemValInput = document.getElementById('sis-points-redeem-val');
  const minRedeemInput = document.getElementById('sis-points-min-redeem');

  const spend = spendInput ? Math.max(1, parseInt(spendInput.value, 10) || 200) : 200;
  const earn = earnInput ? Math.max(1, parseInt(earnInput.value, 10) || 1) : 1;
  const redeemVal = redeemValInput ? Math.max(1, parseInt(redeemValInput.value, 10) || 1) : 1;
  const minRedeem = minRedeemInput ? Math.max(10, parseInt(minRedeemInput.value, 10) || 100) : 100;

  const pointStep = Math.max(1, Math.round(spend / earn));
  pos.settings.pointsPerSpend = spend;
  pos.settings.pointsEarned = earn;
  pos.settings.memberPointSpendStep = pointStep;
  pos.settings.pointValue = redeemVal;
  pos.settings.memberPointRedeemValue = redeemVal;
  pos.settings.minRedeemPoints = minRedeem;

  pos.saveSettings();

  if (typeof showMockupToast === 'function') {
    showMockupToast(`🎁 Aturan Poin Disimpan: Belanja kelipatan Rp ${pointStep.toLocaleString('id-ID')} = 1 Poin`, 'success');
  }
  if (typeof sfx !== 'undefined' && sfx.success) sfx.success();
  closeSisModal('sis-modal-member-rules');
}

// ==========================================
// 5. KARYAWAN, PRESENSI & 8 HAK AKSES (#sis-modal-staff)
// ==========================================

let sisEditingStaffNik = null;

function initSisStaffModal() {
  renderSisStaffList();
  switchStaffModalTab('list');
}

function renderSisStaffList() {
  const container = document.getElementById('sis-staff-list-container');
  if (!container) return;

  const employees = Array.isArray(pos.employees) ? pos.employees : [];

  if (employees.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-400 bg-white border border-dashed border-slate-200 rounded-2xl">
        <span class="text-3xl block mb-1">👤</span>
        <span class="font-bold text-slate-600 block text-xs">Belum ada karyawan terdaftar</span>
      </div>
    `;
    return;
  }

  container.innerHTML = employees.map(emp => {
    let roleBadge = 'bg-slate-200 text-slate-700';
    let roleTitle = 'Kasir Operasional';
    if (emp.role === 'COS') {
      roleBadge = 'bg-emerald-100 text-emerald-800';
      roleTitle = 'Chief of Store (Kepala Toko)';
    } else if (emp.role === 'ACOS') {
      roleBadge = 'bg-blue-100 text-blue-800';
      roleTitle = 'Asst. Chief of Store (Supervisor)';
    }

    // Count permissions (8 checklist terstruktur)
    const permKeys = ['canVoidRetur', 'canStockOpname', 'canBlindKlerk', 'canViewFinancials', 'canStockMutation', 'canWasteStock', 'canManageProducts', 'canManageEmployees'];
    const activePerms = permKeys.filter(k => {
      if (k === 'canVoidRetur') return emp.canVoidRetur !== undefined ? !!emp.canVoidRetur : (!!emp.canVoid || !!emp.canRetur);
      return !!emp[k];
    }).length;

    return `
      <div class="p-3 bg-white border border-slate-200/80 rounded-2xl flex items-center justify-between hover:border-amber-300 transition shadow-2xs">
        <div class="flex items-center gap-2.5 min-w-0 pr-2">
          <div class="w-9 h-9 rounded-full ${roleBadge} font-black flex items-center justify-center text-xs shrink-0 font-mono">
            ${emp.role || 'CREW'}
          </div>
          <div class="min-w-0">
            <span class="font-black text-slate-900 block text-xs truncate">${emp.name}</span>
            <span class="text-[10px] text-slate-400 font-mono block truncate">NIK: ${emp.nik} • Shift: ${emp.shift || 'Shift 1'}</span>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="px-2 py-0.5 bg-slate-50 text-slate-700 border border-slate-200 rounded-full font-bold text-[9px]">
            ${activePerms} / 8 Akses
          </span>
          <button type="button" onclick="editSisStaff('${emp.nik}')" class="p-1.5 text-slate-400 hover:text-amber-700 rounded-lg transition" title="Edit Karyawan & Hak Akses">✏️</button>
          ${emp.role !== 'COS' ? `
            <button type="button" onclick="deleteSisStaff('${emp.nik}')" class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition" title="Hapus Karyawan">🗑️</button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function editSisStaff(nik) {
  sisEditingStaffNik = nik;
  const emp = (pos.employees || []).find(e => e.nik === nik);
  if (!emp) return;

  const nikInput = document.getElementById('sis-staff-nik');
  const pinInput = document.getElementById('sis-staff-pin');
  const nameInput = document.getElementById('sis-staff-name');
  const roleSelect = document.getElementById('sis-staff-role');

  if (nikInput) {
    nikInput.value = emp.nik;
    nikInput.readOnly = true;
    nikInput.classList.add('bg-slate-100');
  }
  if (pinInput) pinInput.value = emp.pin || '1234';
  if (nameInput) nameInput.value = emp.name || '';
  if (roleSelect) roleSelect.value = emp.role || 'CREW';

  // Set 8 permissions
  const isVoidRetur = emp.canVoidRetur !== undefined ? !!emp.canVoidRetur : (!!emp.canVoid || !!emp.canRetur);
  setCheckboxVal('sis-perm-void-retur', isVoidRetur);
  setCheckboxVal('sis-perm-void', isVoidRetur);
  setCheckboxVal('sis-perm-retur', isVoidRetur);
  setCheckboxVal('sis-perm-so', emp.canStockOpname !== undefined ? !!emp.canStockOpname : (emp.role === "COS" || emp.role === "ACOS"));
  setCheckboxVal('sis-perm-klerk', emp.canBlindKlerk !== undefined ? !!emp.canBlindKlerk : true);
  setCheckboxVal('sis-perm-diskon', emp.canBlindKlerk !== undefined ? !!emp.canBlindKlerk : true);
  setCheckboxVal('sis-perm-financials', emp.canViewFinancials !== undefined ? !!emp.canViewFinancials : (emp.role === "COS"));
  setCheckboxVal('sis-perm-drawer', emp.canViewFinancials !== undefined ? !!emp.canViewFinancials : (emp.role === "COS"));
  setCheckboxVal('sis-perm-lpb', emp.canStockMutation !== undefined ? !!emp.canStockMutation : (emp.role === "COS" || emp.role === "ACOS"));
  setCheckboxVal('sis-perm-waste', emp.canWasteStock !== undefined ? !!emp.canWasteStock : (emp.role === "COS" || emp.role === "ACOS"));
  setCheckboxVal('sis-perm-manage-prod', emp.canManageProducts !== undefined ? !!emp.canManageProducts : (emp.role === "COS" || emp.role === "ACOS"));
  setCheckboxVal('sis-perm-manage-staff', emp.canManageEmployees !== undefined ? !!emp.canManageEmployees : (emp.role === "COS"));

  switchStaffModalTab('form');
}

function resetSisStaffForm() {
  sisEditingStaffNik = null;
  const nikInput = document.getElementById('sis-staff-nik');
  const pinInput = document.getElementById('sis-staff-pin');
  const nameInput = document.getElementById('sis-staff-name');
  const roleSelect = document.getElementById('sis-staff-role');

  if (nikInput) {
    nikInput.value = '';
    nikInput.readOnly = false;
    nikInput.classList.remove('bg-slate-100');
  }
  if (pinInput) pinInput.value = '';
  if (nameInput) nameInput.value = '';
  if (roleSelect) {
    roleSelect.value = 'CREW';
    onSisStaffRoleChange();
  }
}

function setCheckboxVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.checked = Boolean(val);
}

function getCheckboxVal(id) {
  const el = document.getElementById(id);
  return el ? el.checked : false;
}

function onSisStaffRoleChange() {
  const roleSelect = document.getElementById('sis-staff-role');
  const role = roleSelect ? roleSelect.value : 'CREW';

  if (role === 'COS') {
    // All 8 permissions checked
    setCheckboxVal('sis-perm-void-retur', true);
    setCheckboxVal('sis-perm-void', true);
    setCheckboxVal('sis-perm-retur', true);
    setCheckboxVal('sis-perm-so', true);
    setCheckboxVal('sis-perm-klerk', true);
    setCheckboxVal('sis-perm-diskon', true);
    setCheckboxVal('sis-perm-financials', true);
    setCheckboxVal('sis-perm-drawer', true);
    setCheckboxVal('sis-perm-lpb', true);
    setCheckboxVal('sis-perm-waste', true);
    setCheckboxVal('sis-perm-manage-prod', true);
    setCheckboxVal('sis-perm-manage-staff', true);
  } else if (role === 'ACOS') {
    // Supervisor permissions (6 items)
    setCheckboxVal('sis-perm-void-retur', true);
    setCheckboxVal('sis-perm-void', true);
    setCheckboxVal('sis-perm-retur', true);
    setCheckboxVal('sis-perm-so', true);
    setCheckboxVal('sis-perm-klerk', true);
    setCheckboxVal('sis-perm-diskon', true);
    setCheckboxVal('sis-perm-financials', false);
    setCheckboxVal('sis-perm-drawer', false);
    setCheckboxVal('sis-perm-lpb', true);
    setCheckboxVal('sis-perm-waste', true);
    setCheckboxVal('sis-perm-manage-prod', true);
    setCheckboxVal('sis-perm-manage-staff', false);
  } else {
    // Cashier basic
    setCheckboxVal('sis-perm-void-retur', false);
    setCheckboxVal('sis-perm-void', false);
    setCheckboxVal('sis-perm-retur', false);
    setCheckboxVal('sis-perm-so', false);
    setCheckboxVal('sis-perm-klerk', true);
    setCheckboxVal('sis-perm-diskon', true);
    setCheckboxVal('sis-perm-financials', false);
    setCheckboxVal('sis-perm-drawer', false);
    setCheckboxVal('sis-perm-lpb', false);
    setCheckboxVal('sis-perm-waste', false);
    setCheckboxVal('sis-perm-manage-prod', false);
    setCheckboxVal('sis-perm-manage-staff', false);
  }
}

function saveSisEmployee() {
  if (!window.pos) return;

  // Cek otorisasi jika kasir aktif tidak memiliki izin MANAGE_EMPLOYEES
  if (typeof hasPermissionForAction === 'function' && !hasPermissionForAction(pos.currentUser, 'MANAGE_EMPLOYEES')) {
    if (typeof requestSupervisorAuth === 'function') {
      requestSupervisorAuth('MANAGE_EMPLOYEES', 'Otorisasi Simpan Data & Hak Akses Karyawan (Khusus COS)', () => {
        executeSaveSisEmployee();
      });
      return;
    }
  }

  executeSaveSisEmployee();
}

function executeSaveSisEmployee() {
  if (!Array.isArray(pos.employees)) pos.employees = [];

  const nikInput = document.getElementById('sis-staff-nik');
  const pinInput = document.getElementById('sis-staff-pin');
  const nameInput = document.getElementById('sis-staff-name');
  const roleSelect = document.getElementById('sis-staff-role');

  const nik = nikInput ? nikInput.value.trim() : '';
  const pin = pinInput ? pinInput.value.trim() : '';
  const name = nameInput ? nameInput.value.trim() : '';
  const role = roleSelect ? roleSelect.value : 'CREW';

  if (!nik || !pin || !name) {
    if (typeof showMockupToast === 'function') {
      showMockupToast('⚠️ NIK, PIN kasir, dan Nama Karyawan wajib diisi!', 'error');
    }
    return;
  }

  const voidReturVal = getCheckboxVal('sis-perm-void-retur') || (getCheckboxVal('sis-perm-void') && getCheckboxVal('sis-perm-retur'));
  const permissions = {
    canVoidRetur: voidReturVal,
    canVoid: voidReturVal,
    canRetur: voidReturVal,
    canStockOpname: getCheckboxVal('sis-perm-so'),
    canBlindKlerk: getCheckboxVal('sis-perm-klerk') || getCheckboxVal('sis-perm-diskon'),
    canViewFinancials: getCheckboxVal('sis-perm-financials') || getCheckboxVal('sis-perm-drawer'),
    canStockMutation: getCheckboxVal('sis-perm-lpb'),
    canWasteStock: getCheckboxVal('sis-perm-waste'),
    canManageProducts: getCheckboxVal('sis-perm-manage-prod'),
    canManageEmployees: getCheckboxVal('sis-perm-manage-staff')
  };

  if (sisEditingStaffNik) {
    const emp = pos.employees.find(e => e.nik === sisEditingStaffNik);
    if (emp) {
      emp.name = name;
      emp.pin = pin;
      emp.role = role;
      Object.assign(emp, permissions);
      if (role === 'COS' && pos.settings) {
        pos.settings.supervisorPin = pin;
        pos.settings.cosPin = pin;
        if (typeof pos.saveSettings === 'function') pos.saveSettings();
      }
      if (pos.currentUser && pos.currentUser.nik === sisEditingStaffNik) {
        pos.currentUser = { ...emp, shift: pos.currentUser.shift || emp.shift || 'Shift 1' };
        if (typeof pos.saveCurrentUser === 'function') pos.saveCurrentUser(pos.currentUser);
      }
    }
    if (typeof showMockupToast === 'function') {
      showMockupToast(`👤 Data karyawan "${name}" berhasil diperbarui!`, 'success');
    }
  } else {
    // Check duplicate NIK
    const dup = pos.employees.find(e => e.nik === nik);
    if (dup) {
      if (typeof showMockupToast === 'function') {
        showMockupToast(`⚠️ NIK "${nik}" sudah digunakan oleh ${dup.name}!`, 'error');
      }
      return;
    }
    const newEmp = {
      nik,
      pin,
      name,
      role,
      shift: 'Shift 1',
      ...permissions
    };
    pos.employees.push(newEmp);
    if (role === 'COS' && pos.settings) {
      pos.settings.supervisorPin = pin;
      pos.settings.cosPin = pin;
      if (typeof pos.saveSettings === 'function') pos.saveSettings();
    }
    if (typeof showMockupToast === 'function') {
      showMockupToast(`🎉 Karyawan baru "${name}" berhasil ditambahkan!`, 'success');
    }
  }

  if (typeof pos.saveEmployees === 'function') {
    pos.saveEmployees();
  } else {
    localStorage.setItem('snack_pos_employees', JSON.stringify(pos.employees));
  }

  if (typeof sfx !== 'undefined' && sfx.success) sfx.success();
  resetSisStaffForm();
  renderSisStaffList();
  switchStaffModalTab('list');
}

function deleteSisStaff(nik) {
  if (!window.pos || !Array.isArray(pos.employees)) return;
  const emp = pos.employees.find(e => e.nik === nik);
  if (!emp) return;

  if (emp.role === 'COS') {
    if (typeof showMockupToast === 'function') {
      showMockupToast('❌ Kepala Toko (COS) tidak dapat dihapus!', 'error');
    }
    return;
  }

  // Cek otorisasi jika kasir aktif tidak memiliki izin MANAGE_EMPLOYEES
  if (typeof hasPermissionForAction === 'function' && !hasPermissionForAction(pos.currentUser, 'MANAGE_EMPLOYEES')) {
    if (typeof requestSupervisorAuth === 'function') {
      requestSupervisorAuth('MANAGE_EMPLOYEES', 'Otorisasi Menghapus Data Karyawan (Khusus COS)', () => {
        executeDeleteSisStaff(nik);
      });
      return;
    }
  }

  executeDeleteSisStaff(nik);
}

function executeDeleteSisStaff(nik) {
  const emp = pos.employees.find(e => e.nik === nik);
  if (!emp) return;

  const conf = confirm(`Apakah Anda yakin ingin menghapus karyawan:\n${emp.name} (NIK: ${emp.nik})?`);
  if (!conf) return;

  pos.employees = pos.employees.filter(e => e.nik !== nik);

  if (typeof pos.saveEmployees === 'function') {
    pos.saveEmployees();
  } else {
    localStorage.setItem('snack_pos_employees', JSON.stringify(pos.employees));
  }

  if (typeof showMockupToast === 'function') {
    showMockupToast(`🗑️ Karyawan "${emp.name}" berhasil dihapus.`, 'info');
  }
  renderSisStaffList();
}

function recordSisAttendance(type = 'MASUK') {
  if (!window.pos) return;
  const currentUser = pos.currentUser || (Array.isArray(pos.employees) && pos.employees[0]);
  if (!currentUser) {
    if (typeof showMockupToast === 'function') {
      showMockupToast('⚠️ Belum ada kasir yang aktif login!', 'error');
    }
    return;
  }

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString('id-ID');

  if (!Array.isArray(pos.attendance)) pos.attendance = [];

  const record = {
    id: `ABS-${dateStr.replace(/-/g, '')}-${currentUser.nik}-${Date.now().toString().slice(-4)}`,
    date: dateStr,
    time: timeStr,
    nik: currentUser.nik,
    name: currentUser.name,
    role: currentUser.role || 'CREW',
    shift: currentUser.shift || 'Shift 1',
    type: type
  };

  pos.attendance.unshift(record);
  if (typeof pos.saveAttendance === 'function') {
    pos.saveAttendance();
  }

  if (typeof showMockupToast === 'function') {
    const icon = type === 'MASUK' ? '🟢' : '🔴';
    showMockupToast(`${icon} Absensi ${type} berhasil dicatat: ${currentUser.name} (${timeStr} WIB)`, 'success');
  }
  if (typeof sfx !== 'undefined' && sfx.success) sfx.success();
}
