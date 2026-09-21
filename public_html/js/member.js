/**
 * SnackPOS - Customer Loyalty & Member Points
 */

// ==========================================
// 9. MODUL MEMBER PELANGGAN & EDIT MANUAL POIN (FLEKSIBEL)
// ==========================================

function openMemberModal(tab = 'search') {
  openModal("modal-member-management");
  switchMemberTab(tab);
  if (typeof fetchMembersFromCloud === 'function') {
    fetchMembersFromCloud();
  }
}

function switchMemberTab(tab) {
  const btnSearch = document.getElementById("member-tab-btn-search");
  const btnList = document.getElementById("member-tab-btn-list");
  const btnRegister = document.getElementById("member-tab-btn-register");

  const contentSearch = document.getElementById("member-tab-content-search");
  const contentList = document.getElementById("member-tab-content-list");
  const contentRegister = document.getElementById("form-register-member");

  const activeBtnClass = "px-4 py-2 text-xs font-black rounded-t-xl bg-white text-indigo-900 border-t-2 border-x-2 border-indigo-200 flex items-center gap-1.5 shadow-2xs";
  const inactiveBtnClass = "px-4 py-2 text-xs font-bold rounded-t-xl text-slate-600 hover:text-indigo-900 flex items-center gap-1.5";

  if (btnSearch) btnSearch.className = tab === 'search' ? activeBtnClass : inactiveBtnClass;
  if (btnList) btnList.className = tab === 'list' ? activeBtnClass : inactiveBtnClass;
  if (btnRegister) btnRegister.className = tab === 'register' ? activeBtnClass : inactiveBtnClass;

  if (contentSearch) contentSearch.classList.toggle("hidden", tab !== 'search');
  if (contentList) contentList.classList.toggle("hidden", tab !== 'list');
  if (contentRegister) contentRegister.classList.toggle("hidden", tab !== 'register');

  if (tab === 'search') {
    renderMemberSearchResults();
    setTimeout(() => document.getElementById("member-search-input")?.focus(), 150);
  } else if (tab === 'list') {
    renderAllMembersTable();
  } else if (tab === 'register') {
    setTimeout(() => document.getElementById("member-reg-name")?.focus(), 150);
  }
}

function renderMemberSearchResults() {
  const query = document.getElementById("member-search-input")?.value.toLowerCase().trim() || "";
  const container = document.getElementById("member-search-results");
  if (!container) return;

  const matched = (pos.members || []).filter(m => 
    !query || 
    m.phone.includes(query) || 
    m.name.toLowerCase().includes(query) ||
    m.id.toLowerCase().includes(query)
  );

  if (matched.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-500 bg-slate-50 rounded-2xl border border-slate-200">
        <div class="text-3xl mb-1">🔍</div>
        <div class="font-bold text-xs text-slate-700">Member tidak ditemukan</div>
        <p class="text-[11px] text-slate-400 mt-0.5">Tidak ada pelanggan dengan nomor atau nama "${query}".</p>
      </div>
    `;
    return;
  }

  container.innerHTML = matched.map(m => `
    <div class="p-3 bg-white hover:bg-indigo-50/60 border border-slate-200 hover:border-indigo-300 rounded-2xl flex items-center justify-between gap-3 transition-all">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-800 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
          👤
        </div>
        <div>
          <div class="font-black text-slate-900 text-xs">${m.name}</div>
          <div class="text-[11px] text-slate-500 font-mono flex items-center gap-2">
            <span>📱 ${m.phone}</span>
            <span>•</span>
            <span class="text-indigo-700 font-black">${m.points || 0} Poin</span>
          </div>
        </div>
      </div>
      <button 
        type="button" 
        onclick="selectMemberForCart('${m.id}')" 
        class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-xs transition-all shrink-0 cursor-pointer"
      >
        Pilih Member
      </button>
    </div>
  `).join("");
}

function renderAllMembersTable() {
  const query = document.getElementById("member-list-search-input")?.value.toLowerCase().trim() || "";
  const tbody = document.getElementById("all-members-table-body");
  if (!tbody) return;

  const filtered = (pos.members || []).filter(m => 
    !query || 
    m.name.toLowerCase().includes(query) || 
    m.phone.includes(query) ||
    m.id.toLowerCase().includes(query)
  );

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">Belum ada member terdaftar.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(m => `
    <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
      <td class="py-2.5 px-3">
        <div class="font-bold text-slate-900">${m.name}</div>
        <div class="text-[10px] text-slate-400 font-mono">ID: ${m.id}</div>
      </td>
      <td class="py-2.5 px-3 font-mono font-bold text-slate-700">${m.phone}</td>
      <td class="py-2.5 px-3 text-center font-mono font-black text-indigo-700">
        ${m.points || 0} Poin
      </td>
      <td class="hidden sm:table-cell py-2.5 px-3 text-right font-mono text-slate-600">
        ${formatRupiah(m.totalSpend || 0)}
      </td>
      <td class="py-2.5 px-3 text-right">
        <button 
          type="button" 
          onclick="selectMemberForCart('${m.id}')" 
          class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-lg text-xs shadow-2xs transition-all" 
          title="Gunakan untuk kasir aktif"
        >
          Pilih Member
        </button>
      </td>
    </tr>
  `).join("");
}

function selectMemberForCart(memberId) {
  const member = (pos.members || []).find(m => m.id === memberId);
  if (!member) return;

  pos.activeMember = member;

  const label = document.getElementById("active-member-label");
  const btn = document.getElementById("btn-select-member");
  const removeBtn = document.getElementById("btn-remove-member");

  if (label) label.textContent = `${member.name} (${member.points || 0} Poin)`;
  if (btn) btn.className = "px-2.5 py-0.5 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-lg text-[10px] sm:text-xs font-black flex items-center gap-1 shadow-2xs";
  if (removeBtn) removeBtn.classList.remove("hidden");

  closeModal("modal-member-management");
  showToast(`Member terpasang: ${member.name} (${member.points || 0} Poin)`, "success");
  sfx.success();
}

function detachMemberFromCart() {
  pos.activeMember = null;

  const label = document.getElementById("active-member-label");
  const btn = document.getElementById("btn-select-member");
  const removeBtn = document.getElementById("btn-remove-member");

  if (label) label.textContent = "+ Member (No. HP)";
  if (btn) btn.className = "px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-lg text-[10px] sm:text-xs font-bold flex items-center gap-1 transition-all";
  if (removeBtn) removeBtn.classList.add("hidden");

  showToast("Member dilepas dari transaksi kasir", "info");
}

// Sinkronisasi data member tunggal secara instan ke server PostgreSQL / PostgREST Cloud
async function syncSingleMemberToCloud(member) {
  if (!member) return false;
  const currentStoreId = (typeof window !== 'undefined' && window.pos?.settings?.storeId) || (typeof getOrCreateStoreId === 'function' ? getOrCreateStoreId() : "STR-MAIN");
  const payload = {
    id: member.id,
    store_id: currentStoreId,
    phone: String(member.phone || '').trim(),
    name: String(member.name || '').trim(),
    address: String(member.address || '').trim(),
    points: Number(member.points) || 0,
    total_spend: Number(member.totalSpend || member.total_spend) || 0,
    created_at: member.createdAt || (member.registeredAt ? new Date(member.registeredAt).toISOString() : new Date().toISOString()),
    updated_at: new Date().toISOString()
  };

  let synced = false;

  // 1. Kirim langsung via PostgREST endpoint /rest/v1/members
  try {
    const res = await fetch('/rest/v1/members', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    });
    if (res.ok || res.status === 201 || res.status === 200 || res.status === 204) {
      console.log(`[MemberCloud] Berhasil sync member ${member.name} (${member.id}) ke server cloud VPS.`);
      synced = true;
    }
  } catch (err) {
    console.warn("[MemberCloud] Gagal via /rest/v1/members, mencoba Supabase client:", err);
  }

  // 2. Fallback via Supabase Client
  if (!synced && typeof supabaseClient !== 'undefined' && supabaseClient) {
    try {
      const { error } = await supabaseClient.from('members').upsert(payload, { onConflict: 'id' });
      if (!error) {
        console.log(`[MemberCloud] Sukses upsert member ${member.name} via Supabase client.`);
        synced = true;
      }
    } catch (e) {}
  }

  return synced;
}

// Tarik data seluruh member dari server online VPS
async function fetchMembersFromCloud() {
  try {
    let cloudList = null;

    // 1. Coba ambil via PostgREST
    try {
      const res = await fetch('/rest/v1/members?select=*&order=created_at.desc');
      if (res.ok) {
        cloudList = await res.json();
      }
    } catch (e) {}

    // 2. Fallback via Supabase Client
    if (!cloudList && typeof supabaseClient !== 'undefined' && supabaseClient) {
      try {
        const { data, error } = await supabaseClient.from('members').select('*').order('created_at', { ascending: false });
        if (!error && Array.isArray(data)) {
          cloudList = data;
        }
      } catch (e) {}
    }

    if (Array.isArray(cloudList) && cloudList.length > 0) {
      if (!pos.members) pos.members = [];
      let changed = false;

      cloudList.forEach(cm => {
        const existing = pos.members.find(m => m.id === cm.id || m.phone === cm.phone);
        if (!existing) {
          pos.members.push({
            id: cm.id,
            storeId: cm.store_id || cm.storeId,
            name: cm.name,
            phone: cm.phone,
            address: cm.address || '',
            points: Number(cm.points) || 0,
            totalSpend: Number(cm.total_spend || cm.totalSpend) || 0,
            registeredAt: cm.created_at ? cm.created_at.split('T')[0] : (new Date().toISOString().split('T')[0]),
            createdAt: cm.created_at
          });
          changed = true;
        } else {
          const cPts = Number(cm.points) || 0;
          const cSpend = Number(cm.total_spend) || 0;
          if (cPts > (existing.points || 0) || cSpend > (existing.totalSpend || 0)) {
            existing.points = Math.max(existing.points || 0, cPts);
            existing.totalSpend = Math.max(existing.totalSpend || 0, cSpend);
            changed = true;
          }
        }
      });

      if (changed) {
        pos.saveMembers();
        // Refresh UI jika sedang di tab member
        renderMemberSearchResults();
        renderAllMembersTable();
      }
    }
  } catch (err) {
    console.warn("[MemberCloud] Gagal menarik data member dari server online:", err);
  }
}

function handleRegisterMember(event) {
  event.preventDefault();

  const name = document.getElementById("member-reg-name")?.value.trim();
  const phone = document.getElementById("member-reg-phone")?.value.trim();
  const address = document.getElementById("member-reg-address")?.value.trim() || "";

  if (!name || !phone) {
    alert("Harap isi Nama Lengkap dan Nomor HP!");
    return;
  }

  // Cek duplikasi nomor HP
  const dup = (pos.members || []).find(m => m.phone === phone);
  if (dup) {
    alert(`Nomor HP ${phone} sudah terdaftar atas nama ${dup.name}! Membuka hasil pencarian...`);
    switchMemberTab('search');
    const searchInput = document.getElementById("member-search-input");
    if (searchInput) {
      searchInput.value = phone;
      renderMemberSearchResults();
    }
    return;
  }

  // Buat ID Member unik yang tidak bertabrakan di database online
  const currentStoreId = (typeof window !== 'undefined' && window.pos?.settings?.storeId) || (typeof getOrCreateStoreId === 'function' ? getOrCreateStoreId() : "STR-MAIN");
  const memberSequence = String((pos.members?.length || 0) + 1).padStart(3, '0');
  const uniqueCode = Date.now().toString().slice(-4);
  const memberId = `MBR-${memberSequence}-${uniqueCode}`;

  const newMember = {
    id: memberId,
    storeId: currentStoreId,
    store_id: currentStoreId,
    name,
    phone,
    address,
    points: 50, // Bonus sambutan 50 poin
    totalSpend: 0,
    registeredAt: new Date().toISOString().split("T")[0],
    createdAt: new Date().toISOString()
  };

  if (!pos.members) pos.members = [];
  pos.members.unshift(newMember);
  pos.saveMembers();

  // Reset form
  document.getElementById("form-register-member")?.reset();

  selectMemberForCart(newMember.id);
  showToast(`Member baru "${name}" berhasil didaftarkan (+50 Bonus Poin)!`, "success");
  sfx.success();

  // Sinkronisasi instan ke server PostgreSQL / PostgREST & Dashboard Owner Online
  syncSingleMemberToCloud(newMember).then(synced => {
    if (synced) {
      console.log(`[Member] Member ${name} langsung terdaftar di database online VPS & dashboard owner.`);
    }
  }).catch(() => {});

  if (typeof syncToSupabase === 'function') {
    syncToSupabase(true);
  }
}

// Inisialisasi tarik member saat POS dibuka
function checkMemberUrlHash() {
  try {
    const hash = (window.location.hash || "").toLowerCase();
    const params = new URLSearchParams(window.location.search);
    if (hash === '#member' || hash === '#daftar-member' || params.get('action') === 'member' || params.get('tab') === 'member') {
      if (typeof openMemberModal === 'function') openMemberModal('register');
    } else if (hash === '#member-list' || hash === '#list-member') {
      if (typeof openMemberModal === 'function') openMemberModal('list');
    }
  } catch (e) {}
}

if (typeof document !== 'undefined') {
  window.addEventListener('hashchange', checkMemberUrlHash);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(fetchMembersFromCloud, 1000);
      setTimeout(checkMemberUrlHash, 600);
    });
  } else {
    setTimeout(fetchMembersFromCloud, 1000);
    setTimeout(checkMemberUrlHash, 600);
  }
}

