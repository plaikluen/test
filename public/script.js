const DEFAULT_API_BASE = "https://test-production-174c.up.railway.app";

const API_BASE = (() => {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = String(params.get("apiBase") || "").trim();
  const fromStorage = String(localStorage.getItem("event1-api-base") || "").trim();

  if (fromQuery) {
    localStorage.setItem("event1-api-base", fromQuery);
    return fromQuery.replace(/\/$/, "");
  }

  if (fromStorage) {
    return fromStorage.replace(/\/$/, "");
  }

  return DEFAULT_API_BASE;
})();

// Fallback list when API is temporarily unavailable.
const LOCAL_TRAIT_PRESET = [];

const form = document.querySelector("#participant-form");
const traitsOptions = document.querySelector("#traits-options");
const formMessage = document.querySelector("#form-message");
const searchInput = document.querySelector("#search-input");
const traitFilter = document.querySelector("#trait-filter");
const resultsContainer = document.querySelector("#results");
const cardTemplate = document.querySelector("#card-template");
const categoryBoard = document.querySelector("#category-board");
const newTraitInput = document.querySelector("#new-trait-input");
const addTraitBtn = document.querySelector("#add-trait-btn");
const traitMessage = document.querySelector("#trait-message");
const introOverlay = document.querySelector("#intro-overlay");
const enterSiteBtn = document.querySelector("#enter-site-btn");
const searchPanel = document.querySelector(".search-panel");
const searchControls = document.querySelector(".search-controls");

let currentTraits = [...LOCAL_TRAIT_PRESET];
let activeTraitChip = "";
const pinnedPostId = Number(new URLSearchParams(window.location.search).get("post") || 0);

let popularTraitsWrap = null;
if (searchPanel && searchControls) {
  popularTraitsWrap = document.createElement("div");
  popularTraitsWrap.className = "popular-traits";
  popularTraitsWrap.innerHTML = `
    <p class="popular-traits-title">แท็กยอดนิยม</p>
    <div class="popular-traits-list" id="popular-traits-list"></div>
  `;
  searchPanel.insertBefore(popularTraitsWrap, searchControls);
}

function renderPopularTraits(participants) {
  const list = popularTraitsWrap?.querySelector("#popular-traits-list");
  if (!list) {
    return;
  }

  const counts = new Map();
  participants.forEach((person) => {
    person.traits.forEach((trait) => {
      counts.set(trait, (counts.get(trait) || 0) + 1);
    });
  });

  const topTraits = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  list.innerHTML = "";

  if (!topTraits.length) {
    const empty = document.createElement("span");
    empty.className = "popular-trait-empty";
    empty.textContent = "ยังไม่มีแท็กยอดนิยม";
    list.appendChild(empty);
    return;
  }

  topTraits.forEach(([trait, count]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "popular-trait-chip";
    button.textContent = `${trait} (${count})`;
    button.addEventListener("click", () => {
      traitFilter.value = trait;
      activeTraitChip = trait;
      fetchParticipants();
    });
    list.appendChild(button);
  });
}

async function fetchPopularTraits() {
  if (!popularTraitsWrap) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/participants`);
    const data = await response.json();
    renderPopularTraits(data.participants || []);
  } catch (error) {
    const list = popularTraitsWrap.querySelector("#popular-traits-list");
    if (list) {
      list.innerHTML = "<span class=\"popular-trait-empty\">โหลดแท็กยอดนิยมไม่สำเร็จ</span>";
    }
  }
}

function closeIntroOverlay() {
  if (!introOverlay || introOverlay.classList.contains("is-hidden")) {
    return;
  }

  introOverlay.classList.add("is-hidden");
  document.body.classList.remove("overlay-open");

  setTimeout(() => {
    introOverlay.remove();
    searchInput?.focus();
  }, 540);
}

function normalizeTraitName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toAbsoluteApiUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  if (raw.startsWith("//")) {
    return `${window.location.protocol}${raw}`;
  }

  if (!API_BASE) {
    return raw;
  }

  if (raw.startsWith("/")) {
    return `${API_BASE}${raw}`;
  }

  return `${API_BASE}/${raw}`;
}

function setMessage(text, isError = false) {
  formMessage.textContent = text;
  formMessage.style.color = isError ? "oklch(0.5 0.17 25)" : "oklch(0.42 0.08 145)";
}

function setTraitMessage(text, isError = false) {
  traitMessage.textContent = text;
  traitMessage.style.color = isError ? "oklch(0.5 0.17 25)" : "oklch(0.42 0.08 145)";
}

function renderTraitOptions(traits) {
  const selectedValues = new Set(
    Array.from(document.querySelectorAll("input[name='traits']:checked")).map((input) => input.value)
  );

  traitsOptions.innerHTML = "";

  traits.forEach((trait) => {
    const wrapper = document.createElement("label");
    wrapper.className = "trait-checkbox";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "traits";
    checkbox.value = trait;
    checkbox.checked = selectedValues.has(trait);

    const span = document.createElement("span");
    span.textContent = trait;

    wrapper.append(checkbox, span);
    traitsOptions.appendChild(wrapper);
  });
}

async function addTraitOption() {
  const traitName = normalizeTraitName(newTraitInput.value);

  if (!traitName) {
    setTraitMessage("กรอกชื่อคุณลักษณะก่อน", true);
    return;
  }

  if (traitName.length > 40) {
    setTraitMessage("คุณลักษณะยาวเกินไป (ไม่เกิน 40 ตัวอักษร)", true);
    return;
  }

  addTraitBtn.disabled = true;
  setTraitMessage("กำลังเพิ่มตัวเลือก...");

  try {
    const response = await fetch(`${API_BASE}/api/traits`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: traitName })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "เพิ่มตัวเลือกไม่สำเร็จ");
    }

    newTraitInput.value = "";
    await fetchTraits();

    const matched = document.querySelector(`input[name='traits'][value="${CSS.escape(data.name)}"]`);
    if (matched) {
      matched.checked = true;
    }

    setTraitMessage(data.message || "เพิ่มตัวเลือกเรียบร้อย");
  } catch (error) {
    setTraitMessage(error.message || "เกิดข้อผิดพลาด", true);
  } finally {
    addTraitBtn.disabled = false;
  }
}

function fillTraitFilter(traits) {
  const previous = traitFilter.value;
  traitFilter.innerHTML = "<option value=\"\">ทั้งหมด</option>";

  traits.forEach((trait) => {
    const option = document.createElement("option");
    option.value = trait;
    option.textContent = trait;
    traitFilter.appendChild(option);
  });

  if (previous && traits.includes(previous)) {
    traitFilter.value = previous;
  }
}

function buildCategoryBoard(participants) {
  const counts = new Map();
  participants.forEach((person) => {
    if (!person.traits.length) {
      const key = "ไม่มีแท็ก";
      counts.set(key, (counts.get(key) || 0) + 1);
      return;
    }

    person.traits.forEach((trait) => {
      counts.set(trait, (counts.get(trait) || 0) + 1);
    });
  });

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  categoryBoard.innerHTML = "";

  if (!sorted.length) {
    return;
  }

  const allChip = document.createElement("button");
  allChip.type = "button";
  allChip.className = `category-chip ${activeTraitChip === "" ? "active" : ""}`;
  allChip.textContent = `ทั้งหมด (${participants.length})`;
  allChip.addEventListener("click", () => {
    activeTraitChip = "";
    traitFilter.value = "";
    fetchParticipants();
  });
  categoryBoard.appendChild(allChip);

  sorted.forEach(([trait, count]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `category-chip ${activeTraitChip === trait ? "active" : ""}`;
    button.textContent = `${trait} (${count})`;
    button.addEventListener("click", () => {
      activeTraitChip = trait === "ไม่มีแท็ก" ? "" : trait;
      traitFilter.value = trait === "ไม่มีแท็ก" ? "" : trait;
      fetchParticipants();
    });
    categoryBoard.appendChild(button);
  });
}

function renderResults(participants) {
  resultsContainer.innerHTML = "";

  if (!participants.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "ยังไม่เจอข้อมูลที่ตรงเงื่อนไข";
    resultsContainer.appendChild(empty);
    categoryBoard.innerHTML = "";
    return;
  }

  buildCategoryBoard(participants);

  participants.forEach((person) => {
    const node = cardTemplate.content.cloneNode(true);
    const card = node.querySelector(".person-card");
    const avatar = node.querySelector(".avatar");
    const avatarPlaceholder = node.querySelector(".avatar-placeholder");
    const name = node.querySelector(".person-name");
    const links = node.querySelector(".person-links");
    const tagList = node.querySelector(".tag-list");
    const date = node.querySelector(".date");
    const actions = node.querySelector(".card-actions");

    name.textContent = person.name;

    if (person.imageUrl) {
      avatar.src = toAbsoluteApiUrl(person.imageUrl);
      avatar.style.display = "block";
      avatarPlaceholder.style.display = "none";
    } else {
      avatar.removeAttribute("src");
      avatar.style.display = "none";
      avatarPlaceholder.style.display = "grid";
    }

    if (person.profileLink) {
      const a = document.createElement("a");
      a.href = person.profileLink;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Bluesky";
      links.appendChild(a);
    }

    if (person.rpPostLink) {
      const a = document.createElement("a");
      a.href = person.rpPostLink;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Roleplay Post";
      links.appendChild(a);
    }

    if (!person.profileLink && !person.rpPostLink) {
      links.innerHTML = "<span>ไม่ได้แนบลิงก์ติดต่อ</span>";
      links.style.color = "oklch(0.45 0.03 55)";
    }

    if (person.traits.length) {
      person.traits.forEach((trait) => {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = trait;
        tagList.appendChild(tag);
      });
    } else {
      tagList.innerHTML = "<span class=\"tag\">ไม่มีแท็ก</span>";
    }

    const d = new Date(person.createdAt);
    date.textContent = `เพิ่มเมื่อ ${d.toLocaleString("th-TH")}`;

    const deleteFeedback = document.createElement("p");
    deleteFeedback.className = "delete-feedback";
    deleteFeedback.textContent = "";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "edit-btn";
    editBtn.textContent = "แก้ไขโพสต์นี้";

    const editForm = document.createElement("form");
    editForm.className = "edit-form";
    editForm.innerHTML = `
      <div class="edit-grid">
        <label>ชื่อ
          <input type="text" name="name" value="${escapeHtml(person.name)}" required />
        </label>
        <label>ลิงก์ Bluesky
          <input type="url" name="profileLink" value="${escapeHtml(person.profileLink || "")}" placeholder="https://..." />
        </label>
        <label>ลิงก์โพสต์โรลเพลย์
          <input type="url" name="rpPostLink" value="${escapeHtml(person.rpPostLink || "")}" placeholder="https://..." />
        </label>
        <label>คุณลักษณะ (คั่นด้วย ,)
          <input type="text" name="traitsText" value="${escapeHtml(person.traits.join(", "))}" placeholder="เช่น คนที่มีหาง, คนที่มีเขี้ยว" />
        </label>
        <label>เปลี่ยนรูปภาพ
          <input type="file" name="image" accept="image/*" />
        </label>
        <label>
          รหัสแก้ไขโพสต์ (ใช้ยืนยันตอนแก้ไข/ลบ)
          <input type="password" name="deleteCode" maxlength="40" placeholder="ใส่รหัสแก้ไขโพสต์" required />
        </label>
        <label class="inline-checkbox">
          <input type="checkbox" name="removeImage" /> ลบรูปภาพปัจจุบัน
        </label>
      </div>
      <div class="edit-actions">
        <button type="button" class="copy-link-btn">คัดลอกลิงก์โพสต์นี้</button>
        <button type="button" class="delete-btn">ลบโพสต์นี้</button>
        <button type="submit" class="save-edit-btn">บันทึกการแก้ไข</button>
        <button type="button" class="cancel-edit-btn">ยกเลิก</button>
      </div>
    `;

    const cancelEditBtn = editForm.querySelector(".cancel-edit-btn");
    const saveEditBtn = editForm.querySelector(".save-edit-btn");
    const copyLinkBtn = editForm.querySelector(".copy-link-btn");
    const deleteBtn = editForm.querySelector(".delete-btn");
    const editDeleteCodeInput = editForm.querySelector("input[name='deleteCode']");

    editBtn.addEventListener("click", () => {
      editForm.classList.toggle("open");
    });

    cancelEditBtn.addEventListener("click", () => {
      editForm.classList.remove("open");
    });

    editForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const deleteCode = editDeleteCodeInput.value.trim();
      if (!deleteCode) {
        deleteFeedback.textContent = "กรุณาใส่รหัสลบโพสต์ก่อนแก้ไข";
        deleteFeedback.dataset.error = "true";
        return;
      }

      const fd = new FormData(editForm);
      const traitsText = String(fd.get("traitsText") || "");
      const traits = traitsText
        .split(/,|\n/)
        .map((item) => item.trim())
        .filter(Boolean);

      const payload = new FormData();
      payload.set("deleteCode", deleteCode);
      payload.set("name", String(fd.get("name") || "").trim());
      payload.set("profileLink", String(fd.get("profileLink") || "").trim());
      payload.set("rpPostLink", String(fd.get("rpPostLink") || "").trim());
      payload.set("traits", JSON.stringify(traits));
      payload.set("removeImage", fd.get("removeImage") ? "true" : "false");

      const imageFile = fd.get("image");
      if (imageFile && imageFile.size > 0) {
        payload.set("image", imageFile);
      }

      saveEditBtn.disabled = true;
      deleteFeedback.textContent = "กำลังบันทึกการแก้ไข...";
      deleteFeedback.dataset.error = "false";

      try {
        const response = await fetch(`${API_BASE}/api/participants/${person.id}`, {
          method: "PUT",
          body: payload
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "แก้ไขโพสต์ไม่สำเร็จ");
        }

        deleteFeedback.textContent = data.message || "แก้ไขโพสต์เรียบร้อย";
        deleteFeedback.dataset.error = "false";
        editForm.classList.remove("open");
        await fetchParticipants();
        await fetchPopularTraits();
      } catch (error) {
        deleteFeedback.textContent = error.message || "เกิดข้อผิดพลาด";
        deleteFeedback.dataset.error = "true";
      } finally {
        saveEditBtn.disabled = false;
      }
    });

    copyLinkBtn.addEventListener("click", async () => {
      const link = `${window.location.origin}${window.location.pathname}?post=${person.id}`;
      try {
        await navigator.clipboard.writeText(link);
        deleteFeedback.textContent = "คัดลอกลิงก์โพสต์แล้ว";
        deleteFeedback.dataset.error = "false";
      } catch (error) {
        deleteFeedback.textContent = "คัดลอกลิงก์ไม่สำเร็จ";
        deleteFeedback.dataset.error = "true";
      }
    });

    deleteBtn.addEventListener("click", async () => {
      const deleteCode = editDeleteCodeInput.value.trim();
      if (!deleteCode) {
        deleteFeedback.textContent = "กรุณาใส่รหัสลบโพสต์";
        deleteFeedback.dataset.error = "true";
        return;
      }

      deleteBtn.disabled = true;
      deleteFeedback.textContent = "กำลังลบโพสต์...";
      deleteFeedback.dataset.error = "false";

      try {
        const response = await fetch(`${API_BASE}/api/participants/${person.id}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ deleteCode })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "ลบโพสต์ไม่สำเร็จ");
        }

        deleteFeedback.textContent = data.message || "ลบโพสต์เรียบร้อย";
        deleteFeedback.dataset.error = "false";
        await fetchParticipants();
        await fetchPopularTraits();
      } catch (error) {
        deleteFeedback.textContent = error.message || "เกิดข้อผิดพลาด";
        deleteFeedback.dataset.error = "true";
      } finally {
        deleteBtn.disabled = false;
      }
    });

    editForm.append(deleteFeedback);
    actions.append(editBtn, editForm);

    card.setAttribute("data-search", escapeHtml(person.name));

    if (pinnedPostId && person.id === pinnedPostId) {
      card.classList.add("pinned-card");

      const pinnedBadge = document.createElement("span");
      pinnedBadge.className = "pinned-badge";
      pinnedBadge.textContent = "โพสต์ที่ปักหมุด";
      name.after(pinnedBadge);

      requestAnimationFrame(() => {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }

    resultsContainer.appendChild(node);
  });
}

async function fetchTraits() {
  try {
    const response = await fetch(`${API_BASE}/api/traits`);
    if (!response.ok) {
      throw new Error("โหลดคุณลักษณะล้มเหลว");
    }

    const data = await response.json();
    const combined = Array.from(new Set([...LOCAL_TRAIT_PRESET, ...(data.traits || [])]));
    currentTraits = combined;
    renderTraitOptions(currentTraits);
    fillTraitFilter(currentTraits);
  } catch (error) {
    renderTraitOptions(currentTraits);
    fillTraitFilter(currentTraits);
  }
}

async function fetchParticipants() {
  const search = searchInput.value.trim();
  const trait = traitFilter.value.trim();

  const params = new URLSearchParams();
  if (search) {
    params.set("search", search);
  }
  if (trait) {
    params.set("trait", trait);
  }

  const endpoint = `${API_BASE}/api/participants${params.toString() ? `?${params}` : ""}`;
  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error("โหลดข้อมูลไม่สำเร็จ");
    }

    const data = await response.json();
    renderResults(data.participants || []);
  } catch (error) {
    renderResults([]);

    if (window.location.hostname.endsWith("github.io") && !API_BASE) {
      setMessage("ไม่สามารถเชื่อมต่อ backend ได้ ลองกลับมาอีกครั้งหรือติดต่อผู้ดูแล", true);
    }
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("กำลังบันทึก...");

  const selectedTraits = Array.from(
    document.querySelectorAll("input[name='traits']:checked")
  ).map((input) => input.value);

  const formData = new FormData(form);
  formData.set("traits", JSON.stringify(selectedTraits));

  try {
    const response = await fetch(`${API_BASE}/api/participants`, {
      method: "POST",
      body: formData
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "บันทึกไม่สำเร็จ");
    }

    setMessage("บันทึกเรียบร้อยแล้ว");
    form.reset();
    await fetchTraits();
    await fetchParticipants();
    await fetchPopularTraits();
  } catch (error) {
    setMessage(error.message || "เกิดข้อผิดพลาด", true);
  }
});

let typingTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    fetchParticipants();
  }, 220);
});

traitFilter.addEventListener("change", () => {
  activeTraitChip = traitFilter.value;
  fetchParticipants();
});

addTraitBtn.addEventListener("click", addTraitOption);

newTraitInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addTraitOption();
  }
});

if (enterSiteBtn) {
  enterSiteBtn.addEventListener("click", closeIntroOverlay);
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeIntroOverlay();
  }
});

(async function init() {
  await fetchTraits();
  await fetchParticipants();
  await fetchPopularTraits();
})();
