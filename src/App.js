// path: src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { initializeApp, getApp, getApps } from "firebase/app";
import {
  getFirestore, collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot,
} from "firebase/firestore";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, sendPasswordResetEmail,
} from "firebase/auth";
import ExcelJS from "exceljs";
import "./App.css";

// ===== Firebase =====
const firebaseConfig = {
  apiKey: "AIzaSyCHv-swPrzkKKQxuB0nZG-jQ4s4ecrbLUw",
  authDomain: "web-4de0f.firebaseapp.com",
  projectId: "web-4de0f",
  storageBucket: "web-4de0f.appspot.com",
  messagingSenderId: "766258113961",
  appId: "1:766258113961:web:b085d899d1d640998fa8b8",
};
const REPORT_CODE = "HC-TE-001";

const getCurrentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const getDaysInMonth = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return 31;
  return new Date(y, m, 0).getDate();
};
const sanitizeSheetName = (base, used) => {
  let name = (base || "Sheet").replace(/[\\/?*\[\]:]/g, " ").trim();
  if (!name) name = "Sheet";
  name = name.slice(0, 31);
  let i = 1;
  const raw = name;
  while (used.has(name)) {
    const suffix = ` (${i++})`;
    name = (raw.slice(0, 31 - suffix.length) + suffix).slice(0, 31);
  }
  used.add(name);
  return name;
};

export default function SalaryApp() {
  // Core
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null);

  // Settings
  const [month, setMonth] = useState(getCurrentMonth());
  const [daysInMonth, setDaysInMonth] = useState(getDaysInMonth(getCurrentMonth()));
  const [pricePerBook, setPricePerBook] = useState(3.5); // nghìn VND

  // Data
  const [employees, setEmployees] = useState([]);
  const [classes, setClasses] = useState([]);
  const [entries, setEntries] = useState([]);

  // Auth UI
  const [isSignup, setIsSignup] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [authMsg, setAuthMsg] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");

  // Forms
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newSchoolName, setNewSchoolName] = useState("");
  const [selectedSchoolForClass, setSelectedSchoolForClass] = useState("");
  const [newClassName, setNewClassName] = useState("");

  // Entry form
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedSchool, setSelectedSchool] = useState("");
  const [inputClass, setInputClass] = useState("");
  const [inputBooks, setInputBooks] = useState("");
  const [inputNote, setInputNote] = useState("");

  // UI
  const [detailModal, setDetailModal] = useState(null);
  const [selectedEntries, setSelectedEntries] = useState(new Set());
  const [filterEmployee, setFilterEmployee] = useState("");

  // ==== INIT ====
  useEffect(() => {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    setDb(getFirestore(app));
    setAuth(getAuth(app));
  }, []);
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, [auth]);
  useEffect(() => {
    setDaysInMonth(getDaysInMonth(month));
    if (selectedDay && Number(selectedDay) > getDaysInMonth(month)) setSelectedDay("");
  }, [month]); // why: co dãn số ngày theo tháng

  // ==== AUTH ====
  const login = async () => {
    setAuthMsg("");
    if (!email || !password) return setAuthMsg("⚠️ Nhập email & mật khẩu.");
    setLoadingAuth(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch {
      setAuthMsg("❌ Sai tài khoản hoặc mật khẩu.");
    } finally {
      setLoadingAuth(false);
    }
  };
  const register = async () => {
    setAuthMsg("");
    if (!regEmail || !regPassword || !regConfirm) return setAuthMsg("⚠️ Điền đủ thông tin.");
    if (regPassword.length < 6) return setAuthMsg("⚠️ Mật khẩu ≥ 6 ký tự.");
    if (regPassword !== regConfirm) return setAuthMsg("⚠️ Xác nhận không khớp.");
    setLoadingAuth(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, regEmail.trim(), regPassword);
      try {
        await setDoc(doc(getFirestore(), "users", cred.user.uid), { email: cred.user.email, createdAt: Date.now() }, { merge: true });
      } catch {
        // why: không làm hỏng flow đăng ký nếu ghi user profile phụ bị lỗi
      }
      setAuthMsg("✅ Đăng ký thành công! Vui lòng đăng nhập.");
      setIsSignup(false);
      setEmail(regEmail.trim());
      setRegEmail(""); setRegPassword(""); setRegConfirm("");
    } catch {
      setAuthMsg("❌ Không thể đăng ký (email có thể đã tồn tại).");
    } finally {
      setLoadingAuth(false);
    }
  };
  const resetPassword = async () => {
    setAuthMsg("");
    if (!email) return setAuthMsg("⚠️ Nhập email để đặt lại mật khẩu.");
    setLoadingAuth(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setAuthMsg("✉️ Đã gửi email đặt lại mật khẩu.");
    } catch {
      setAuthMsg("❌ Không thể gửi email đặt lại.");
    } finally {
      setLoadingAuth(false);
    }
  };
  const logout = async () => signOut(auth);

  // ==== FIRESTORE ====
  useEffect(() => {
    if (!db || !user) return;
    const unsubEmp = onSnapshot(collection(db, `users/${user.uid}/employees`), (snap) => {
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubClass = onSnapshot(collection(db, `users/${user.uid}/months/${month}/classes`), (snap) => {
      setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubEntry = onSnapshot(collection(db, `users/${user.uid}/months/${month}/entries`), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setEntries(data.sort((a, b) => (a.day !== b.day ? b.day - a.day : (b.timestamp || 0) - (a.timestamp || 0))));
    });
    return () => { unsubEmp(); unsubClass(); unsubEntry(); };
  }, [db, month, user]);

  // ==== COMPUTED ====
  const schools = useMemo(() => {
    const unique = [...new Set(classes.map((c) => c.school).filter(Boolean))];
    return unique.sort();
  }, [classes]);

  const classesForSelectedSchool = useMemo(() => {
    if (!selectedSchool) return [];
    return classes.filter((c) => c.school === selectedSchool).map((c) => c.name).sort();
  }, [classes, selectedSchool]);

  const filteredEntries = useMemo(() => {
    if (!filterEmployee) return entries;
    return entries.filter((e) => e.employee === filterEmployee);
  }, [entries, filterEmployee]);

  const summaryTable = useMemo(() => {
    const table = {};
    const detailMap = {};
    filteredEntries.forEach((entry) => {
      const key = `${entry.school}_${entry.class}_${entry.day}`;
      if (!table[key]) { table[key] = 0; detailMap[key] = []; }
      table[key] += entry.books || 0;
      detailMap[key].push({ employee: entry.employee, books: entry.books || 0, note: entry.note || "" });
    });
    const grouped = {};
    Object.keys(table).forEach((key) => {
      const [school, className, day] = key.split("_");
      const g = `${school}_${className}`;
      if (!grouped[g]) grouped[g] = { school, class: className, days: Array(31).fill(0), details: Array(31).fill(null) };
      const di = parseInt(day, 10) - 1;
      if (di >= 0 && di < 31) { grouped[g].days[di] = table[key]; grouped[g].details[di] = detailMap[key]; }
    });
    return Object.values(grouped);
  }, [filteredEntries]);

  const employeeSummaryTables = useMemo(() => {
    const tables = {};
    employees.forEach((emp) => {
      const empEntries = entries.filter((e) => e.employee === emp.name);
      if (empEntries.length === 0) return;
      const table = {};
      empEntries.forEach((entry) => {
        const key = `${entry.school}_${entry.class}_${entry.day}`;
        if (!table[key]) table[key] = 0;
        table[key] += entry.books || 0;
      });
      const grouped = {};
      Object.keys(table).forEach((key) => {
        const [school, className, day] = key.split("_");
        const k = `${school}_${className}`;
        if (!grouped[k]) grouped[k] = { school, class: className, days: Array(31).fill(0) };
        const di = parseInt(day, 10) - 1;
        if (di >= 0 && di < 31) grouped[k].days[di] = table[key];
      });
      tables[emp.name] = Object.values(grouped);
    });
    return tables;
  }, [entries, employees]);

  const totalBooks = useMemo(() => summaryTable.reduce((s, r) => s + r.days.reduce((a, b) => a + b, 0), 0), [summaryTable]);
  const totalMoney = useMemo(() => Math.round(totalBooks * pricePerBook * 1000), [totalBooks, pricePerBook]);

  // ==== CRUD ====
  const addEmployee = async () => {
    if (!newEmployeeName.trim() || !user) return alert("⚠️ Nhập tên nhân viên!");
    const id = `emp_${Date.now()}`;
    await setDoc(doc(db, `users/${user.uid}/employees`, id), { name: newEmployeeName.trim() });
    setNewEmployeeName("");
  };
  const deleteEmployee = async (id) => {
    if (window.confirm("🗑️ Xóa nhân viên này?")) await deleteDoc(doc(db, `users/${user.uid}/employees`, id));
  };
  const addClass = async () => {
    const schoolToAdd = selectedSchoolForClass || newSchoolName.trim();
    if (!schoolToAdd || !newClassName.trim() || !user) return alert("⚠️ Chọn/nhập trường và lớp!");
    const id = `class_${Date.now()}`;
    await setDoc(doc(db, `users/${user.uid}/months/${month}/classes`, id), { school: schoolToAdd, name: newClassName.trim() });
    setNewClassName(""); if (!selectedSchoolForClass) setNewSchoolName("");
  };
  const deleteClass = async (id) => {
    if (window.confirm("🗑️ Xóa lớp này?")) await deleteDoc(doc(db, `users/${user.uid}/months/${month}/classes`, id));
  };
  const addEntry = async () => {
    if (!user || !selectedEmployee || !selectedDay || !selectedSchool || !inputClass.trim() || !inputBooks) return alert("⚠️ Nhập đủ!");
    const day = parseInt(selectedDay, 10);
    if (day < 1 || day > daysInMonth) return alert(`⚠️ Ngày phải từ 1..${daysInMonth}`);
    const books = parseInt(inputBooks, 10) || 0;
    const classname = inputClass.trim();
    const dup = entries.find((e) => e.employee === selectedEmployee && e.day === day && e.school === selectedSchool && e.class === classname);
    if (dup) {
      if (window.confirm(`Đã có ${dup.books} sổ. Sửa thành ${books}?`)) {
        await updateDoc(doc(db, `users/${user.uid}/months/${month}/entries`, dup.id), { books, note: inputNote.trim() || dup.note, timestamp: Date.now() });
      }
      setInputClass(""); setInputBooks(""); setInputNote("");
      return;
    }
    const id = `entry_${Date.now()}`;
    await setDoc(doc(db, `users/${user.uid}/months/${month}/entries`, id), {
      employee: selectedEmployee, day, school: selectedSchool, class: classname, books, note: inputNote.trim() || "", timestamp: Date.now(),
    });
    setInputClass(""); setInputBooks(""); setInputNote("");
  };
  const deleteEntry = async (id) => {
    if (window.confirm("🗑️ Xóa đợt nhập này?")) await deleteDoc(doc(db, `users/${user.uid}/months/${month}/entries`, id));
  };
  const editEntry = async (entry) => {
    const newBooks = prompt(`✏️ Sửa số sổ\n${entry.employee} - ${entry.school}/${entry.class} - Ngày ${entry.day}\nHiện tại: ${entry.books}\nSố mới:`, entry.books);
    if (newBooks === null || newBooks === "") return;
    const n = parseInt(newBooks, 10);
    if (Number.isNaN(n) || n < 0) return alert("⚠️ Số hợp lệ!");
    const newNote = prompt(`Ghi chú hiện tại: ${entry.note || "(không)"}\nGhi chú mới (trống = giữ):`, entry.note || "");
    await updateDoc(doc(db, `users/${user.uid}/months/${month}/entries`, entry.id), {
      books: n, note: newNote !== null ? newNote.trim() : entry.note, timestamp: Date.now(),
    });
  };
  const toggleSelectEntry = (id) => {
    const s = new Set(selectedEntries);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedEntries(s);
  };
  const selectAllEntries = () => {
    if (selectedEntries.size === entries.length) setSelectedEntries(new Set());
    else setSelectedEntries(new Set(entries.map((e) => e.id)));
  };
  const deleteSelectedEntries = async () => {
    if (!selectedEntries.size) return alert("⚠️ Chọn entry để xóa!");
    if (!window.confirm(`🗑️ Xóa ${selectedEntries.size} đợt đã chọn?`)) return;
    await Promise.all(Array.from(selectedEntries).map((id) => deleteDoc(doc(db, `users/${user.uid}/months/${month}/entries`, id))));
    setSelectedEntries(new Set());
  };

  // Modal
  const openDetailModal = (day, school) => setDetailModal({ day, school });
  const closeDetailModal = () => setDetailModal(null);
  const modalDetailData = useMemo(() => {
    if (!detailModal) return null;
    const { day, school } = detailModal;
    const dayEntries = entries.filter((e) => e.day === day && e.school === school);
    const grouped = {};
    dayEntries.forEach((entry) => {
      const k = `${entry.employee}_${entry.class}`;
      if (!grouped[k]) grouped[k] = { employee: entry.employee, class: entry.class, books: 0, notes: [] };
      grouped[k].books += entry.books || 0;
      if (entry.note) grouped[k].notes.push(entry.note);
    });
    const list = Object.values(grouped).sort((a, b) => (a.employee === b.employee ? a.class.localeCompare(b.class) : a.employee.localeCompare(b.employee)));
    const total = list.reduce((s, i) => s + i.books, 0);
    return { day, school, details: list, totalBooks: total };
  }, [detailModal, entries]);

  const formatVND = (v) => v.toLocaleString("vi-VN") + " ₫";

  // ===== EXPORT EXCEL (giá động qua sheet Cấu hình) =====
  const exportExcel = async () => {
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = "SalaryApp"; wb.created = new Date();

      const usedSheetNames = new Set();
      const employeeSheetMeta = []; // [{displayName, sheetName, school, sum, money, startDataRow, endDataRow}]
      let summaryMeta = null;

      const addHeaderFooterAndLogo = (ws, title) => {
        ws.headerFooter = {
          differentFirst: false,
          oddHeader: `&L Mã BC: ${REPORT_CODE} &C ${title} &R Tháng ${month}`,
          oddFooter: `&L ${user?.email || ""} &C Trang &P/&N &R In: &D &T`,
        };
        const base64 = window.APP_LOGO_BASE64 || null; // why: logo tùy chọn
        if (base64) {
          const ext = base64.includes("image/jpeg") ? "jpeg" : "png";
          const imgId = wb.addImage({ base64, extension: ext });
          ws.addImage(imgId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 140, height: 40 } });
        }
      };

      // --- Sheet Cấu hình (trung tâm giá/sổ) ---
      const configSheetName = sanitizeSheetName("Cấu hình", usedSheetNames);
      const cfg = wb.addWorksheet(configSheetName, { views: [{ state: "frozen", ySplit: 2 }] });
      addHeaderFooterAndLogo(cfg, "CẤU HÌNH BÁO CÁO");

      cfg.columns = [{ width: 28 }, { width: 20 }, { width: 40 }];
      const c1 = cfg.addRow(["CẤU HÌNH BÁO CÁO"]);
      c1.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
      c1.alignment = { vertical: "middle", horizontal: "center" };
      c1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B7AD1" } };
      cfg.mergeCells(1, 1, 1, 3);

      const r2 = cfg.addRow(["Giá/sổ (nghìn VND):", pricePerBook, "👉 Sửa ô B2 để đổi giá cho toàn bộ workbook"]);
      cfg.getCell("B2").numFmt = "0.0";
      r2.eachCell((cell, i) => {
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        if (i === 3) cell.font = { italic: true, color: { argb: "FF666666" } };
      });

      cfg.addRow(["Tháng báo cáo:", month]);
      cfg.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

      const CONFIG_PRICE_REF = `'${configSheetName}'!$B$2`; // why: 1 nơi điều khiển giá

      const buildDataSheet = ({ sheetName, title, subtitle, rowsData }) => {
        const ws = wb.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 8 }] });
        addHeaderFooterAndLogo(ws, title);

        ws.columns = [
          { header: "Trường", width: 20 },
          { header: "Lớp", width: 12 },
          ...Array(daysInMonth).fill(0).map(() => ({ width: 6 })),
          { header: "Tổng Sổ", width: 10 },
          { header: "Tiền (VND)", width: 16 },
        ];
        const COL_SCHOOL = 1;
        const COL_CLASS = 2;
        const COL_DAY_START = 3;
        const COL_DAY_END = COL_DAY_START + daysInMonth - 1;
        const COL_SUM = COL_DAY_END + 1;
        const COL_MONEY = COL_SUM + 1;
        const totalCols = COL_MONEY;
        const colLetter = (idx) => ws.getColumn(idx).letter;

        // Title + info (B3 liên kết giá)
        const r1 = ws.addRow([title]);
        const r2 = ws.addRow([subtitle]);
        const r3 = ws.addRow(["Giá/sổ (nghìn VND):", { formula: CONFIG_PRICE_REF }]); // hiển thị giá từ Cấu hình
        ws.addRow([""]);
        const r5 = ws.addRow(["Sửa giá tại sheet 'Cấu hình' (ô B2) → Tiền tự cập nhật."]);
        ws.addRow([""]);

        const header = ["Trường", "Lớp", ...Array.from({ length: daysInMonth }, (_, i) => `Ngày ${i + 1}`), "Tổng Sổ", "Tiền (VND)"];
        const headerRow = ws.addRow(header);

        const mergeRow = (ri) => ws.mergeCells(ri, 1, ri, totalCols);
        [1, 2, 5].forEach(mergeRow); // row3 không merge vì có B3 là giá động

        const center = { vertical: "middle", horizontal: "center" };
        const left = { vertical: "middle", horizontal: "left" };
        r1.height = 26; ws.getRow(8).height = 22;
        r1.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
        r1.alignment = center;
        r1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF007BFF" } };
        r2.font = { bold: true, size: 11 }; r2.alignment = left;
        r3.font = { bold: true, size: 11 };
        r5.font = { bold: true, size: 12, color: { argb: "FF007BFF" } };
        r5.alignment = center;
        r5.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7F3FF" } };

        headerRow.eachCell((cell) => {
          cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
          cell.alignment = center;
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
          cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        });

        const startDataRow = 9;
        let dataRowCount = 0;

        rowsData.forEach(({ school, className, days }) => {
          const dayVals = (days || []).slice(0, daysInMonth).map((v) => (v || 0));
          while (dayVals.length < daysInMonth) dayVals.push(0);
          const row = ws.addRow([school, className, ...dayVals, null, null]);
          dataRowCount += 1;
          const r = row.number;

          const sumFormula = `SUM(${colLetter(COL_DAY_START)}${r}:${colLetter(COL_DAY_END)}${r})`;
          row.getCell(COL_SUM).value = { formula: sumFormula };
          // why: Tiền phụ thuộc 'Cấu hình'!$B$2 nên đổi 1 nơi là đủ
          const moneyFormula = `ROUND(${colLetter(COL_SUM)}${r}*${CONFIG_PRICE_REF}*1000,0)`;
          row.getCell(COL_MONEY).value = { formula: moneyFormula };
          row.getCell(COL_MONEY).numFmt = '#,##0" ₫"';

          row.eachCell((cell, col) => {
            cell.alignment = col <= COL_CLASS ? left : center;
            cell.border = { top: { style: "thin", color: { argb: "FFCCCCCC" } }, left: { style: "thin", color: { argb: "FFCCCCCC" } }, bottom: { style: "thin", color: { argb: "FFCCCCCC" } }, right: { style: "thin", color: { argb: "FFCCCCCC" } } };
            if ((r - startDataRow) % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
          });
          row.getCell(COL_SCHOOL).font = { bold: true };
        });

        const totalRow = ws.addRow(["", "TỔNG", ...Array(daysInMonth).fill(null), null, null]);
        const endDataRow = startDataRow + dataRowCount - 1;
        if (dataRowCount > 0) {
          for (let c = COL_DAY_START; c <= COL_DAY_END; c++) {
            const L = colLetter(c);
            totalRow.getCell(c).value = { formula: `SUM(${L}${startDataRow}:${L}${endDataRow})` };
          }
          totalRow.getCell(COL_SUM).value = { formula: `SUM(${colLetter(COL_SUM)}${startDataRow}:${colLetter(COL_SUM)}${endDataRow})` };
          totalRow.getCell(COL_MONEY).value = { formula: `SUM(${colLetter(COL_MONEY)}${startDataRow}:${colLetter(COL_MONEY)}${endDataRow})` };
        } else {
          for (let c = COL_DAY_START; c <= COL_DAY_END; c++) totalRow.getCell(c).value = 0;
          totalRow.getCell(COL_SUM).value = 0;
          totalRow.getCell(COL_MONEY).value = 0;
        }
        totalRow.getCell(COL_MONEY).numFmt = '#,##0" ₫"';
        totalRow.eachCell((cell) => {
          cell.font = { bold: true };
          cell.alignment = { vertical: "middle", horizontal: "center" };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
          cell.border = { top: { style: "medium" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        });

        ws.autoFilter = { from: { row: 8, column: 1 }, to: { row: 8, column: totalCols } };
        ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

        return {
          startDataRow,
          endDataRow,
          col: {
            school: ws.getColumn(1).letter,
            sum: ws.getColumn(COL_SUM).letter,
            money: ws.getColumn(COL_MONEY).letter,
          },
        };
      };

      const toRowsData = (table) =>
        table.map((row) => ({ school: row.school, className: row.class, days: row.days }));

      // === SHEETS NHÂN VIÊN ===
      const sheetNameByEmployee = {};
      Object.keys(employeeSummaryTables).forEach((empName) => {
        const sheetName = sanitizeSheetName(empName, usedSheetNames);
        sheetNameByEmployee[empName] = sheetName;
        const meta = buildDataSheet({
          sheetName,
          title: "BÁO CÁO SỔ Y TẾ KHÁM TRẺ EM",
          subtitle: `Tháng: ${month}   |   Nhân viên: ${empName}`,
          rowsData: toRowsData(employeeSummaryTables[empName] || []),
        });
        employeeSheetMeta.push({
          displayName: empName,
          sheetName,
          ...meta.col,
          startDataRow: meta.startDataRow,
          endDataRow: meta.endDataRow,
        });
      });

      // === SHEET TỔNG CHUNG ===
      const summarySheetName = sanitizeSheetName("Tổng chung", usedSheetNames);
      const sumMeta = buildDataSheet({
        sheetName: summarySheetName,
        title: "BÁO CÁO SỔ Y TẾ KHÁM TRẺ EM",
        subtitle: `Tháng: ${month}   |   Tổng hợp tất cả nhân viên`,
        rowsData: toRowsData(summaryTable),
      });
      summaryMeta = {
        sheetName: summarySheetName,
        ...sumMeta.col,
        startDataRow: sumMeta.startDataRow,
        endDataRow: sumMeta.endDataRow,
      };

      // === SHEET PIVOT NHANH ===
      const pivotSheetName = sanitizeSheetName("Pivot nhanh", usedSheetNames);
      const pv = wb.addWorksheet(pivotSheetName, { views: [{ state: "frozen", ySplit: 6 }] });
      addHeaderFooterAndLogo(pv, "PIVOT NHANH");

      const H1 = pv.addRow(["PIVOT NHANH - TỔNG TIỀN THEO TRƯỜNG / NHÂN VIÊN"]);
      H1.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
      H1.alignment = { vertical: "middle", horizontal: "center" };
      H1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B7AD1" } };
      pv.mergeCells(1, 1, 1, 12);

      pv.addRow([`Tháng: ${month}`]).font = { bold: true };
      pv.addRow([`Giá/sổ (nghìn VND):`, { formula: CONFIG_PRICE_REF }]).font = { bold: true };
      pv.addRow([""]);

      const addTableHeader = (rowIdx, titles) => {
        const r = pv.getRow(rowIdx);
        titles.forEach((t, i) => {
          const c = r.getCell(i + 1);
          c.value = t;
          c.font = { bold: true, color: { argb: "FFFFFFFF" } };
          c.alignment = { vertical: "middle", horizontal: "center" };
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F5597" } };
          c.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        });
        r.height = 20;
      };
      const moneyFmt = '#,##0" ₫"';

      // Block 1: Tổng theo Trường
      pv.addRow(["Tổng theo Trường"]).font = { bold: true, size: 13 };
      const b1Header = pv.actualRowCount + 1;
      addTableHeader(b1Header, ["Trường", "Tổng Sổ", "Tiền (VND)"]);
      const b1Start = b1Header + 1;
      schools.forEach((schoolName, idx) => {
        const r = pv.getRow(b1Start + idx);
        r.getCell(1).value = schoolName;
        r.getCell(2).value = {
          formula: `SUMIF('${summaryMeta.sheetName}'!${summaryMeta.school}$${summaryMeta.startDataRow}:${summaryMeta.school}$${summaryMeta.endDataRow}, A${b1Start + idx}, '${summaryMeta.sheetName}'!${summaryMeta.sum}$${summaryMeta.startDataRow}:${summaryMeta.sum}$${summaryMeta.endDataRow})`,
        };
        r.getCell(3).value = {
          formula: `SUMIF('${summaryMeta.sheetName}'!${summaryMeta.school}$${summaryMeta.startDataRow}:${summaryMeta.school}$${summaryMeta.endDataRow}, A${b1Start + idx}, '${summaryMeta.sheetName}'!${summaryMeta.money}$${summaryMeta.startDataRow}:${summaryMeta.money}$${summaryMeta.endDataRow})`,
        };
        r.getCell(3).numFmt = moneyFmt;
        for (let c = 1; c <= 3; c++) {
          r.getCell(c).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
          r.getCell(c).alignment = c === 1 ? { vertical: "middle", horizontal: "left" } : { vertical: "middle", horizontal: "center" };
        }
      });
      const b1End = b1Start + Math.max(schools.length - 1, 0);
      const b1Total = pv.getRow(b1End + 1);
      b1Total.getCell(1).value = "TỔNG"; b1Total.getCell(1).font = { bold: true };
      b1Total.getCell(2).value = { formula: `SUM(B${b1Start}:B${b1End})` };
      b1Total.getCell(3).value = { formula: `SUM(C${b1Start}:C${b1End})` };
      b1Total.getCell(3).numFmt = moneyFmt;
      for (let c = 1; c <= 3; c++) b1Total.getCell(c).border = { top: { style: "medium" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      pv.addRow([""]);

      // Block 2: Tổng theo Nhân viên
      pv.addRow(["Tổng theo Nhân viên"]).font = { bold: true, size: 13 };
      const b2Header = pv.actualRowCount + 1;
      addTableHeader(b2Header, ["Nhân viên", "Tổng Sổ", "Tiền (VND)"]);
      const b2Start = b2Header + 1;
      employeeSheetMeta.forEach((meta, i) => {
        const r = pv.getRow(b2Start + i);
        r.getCell(1).value = meta.displayName;
        r.getCell(2).value = { formula: `SUM('${meta.sheetName}'!${meta.sum}$${meta.startDataRow}:${meta.sum}$${meta.endDataRow})` };
        r.getCell(3).value = { formula: `SUM('${meta.sheetName}'!${meta.money}$${meta.startDataRow}:${meta.money}$${meta.endDataRow})` };
        r.getCell(3).numFmt = moneyFmt;
        for (let c = 1; c <= 3; c++) {
          r.getCell(c).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
          r.getCell(c).alignment = c === 1 ? { vertical: "middle", horizontal: "left" } : { vertical: "middle", horizontal: "center" };
        }
      });
      const b2End = b2Start + Math.max(employeeSheetMeta.length - 1, 0);
      const b2Total = pv.getRow(b2End + 1);
      b2Total.getCell(1).value = "TỔNG"; b2Total.getCell(1).font = { bold: true };
      b2Total.getCell(2).value = { formula: `SUM(B${b2Start}:B${b2End})` };
      b2Total.getCell(3).value = { formula: `SUM(C${b2Start}:C${b2End})` };
      b2Total.getCell(3).numFmt = moneyFmt;
      for (let c = 1; c <= 3; c++) b2Total.getCell(c).border = { top: { style: "medium" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      pv.addRow([""]);

      // Block 3: Bảng chéo Trường × Nhân viên (Tiền)
      pv.addRow(["Bảng chéo: Trường × Nhân viên (Tiền)"]).font = { bold: true, size: 13 };
      const mHeader = pv.actualRowCount + 1;
      const matrixHeaders = ["Trường", ...employeeSheetMeta.map((m) => m.displayName), "Tổng theo Trường"];
      addTableHeader(mHeader, matrixHeaders);
      const mStart = mHeader + 1;

      schools.forEach((schoolName, idx) => {
        const rIdx = mStart + idx;
        const r = pv.getRow(rIdx);
        r.getCell(1).value = schoolName;
        employeeSheetMeta.forEach((meta, j) => {
          const cell = r.getCell(2 + j);
          cell.value = {
            formula: `SUMIF('${meta.sheetName}'!A$${meta.startDataRow}:A$${meta.endDataRow}, $A${rIdx}, '${meta.sheetName}'!${meta.money}$${meta.startDataRow}:${meta.money}$${meta.endDataRow})`,
          };
          cell.numFmt = moneyFmt;
          cell.alignment = { vertical: "middle", horizontal: "center" };
          cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        });
        const totalCell = r.getCell(2 + employeeSheetMeta.length);
        const fromL = pv.getColumn(2).letter;
        const toL = pv.getColumn(1 + employeeSheetMeta.length).letter;
        totalCell.value = { formula: `SUM(${fromL}${rIdx}:${toL}${rIdx})` };
        totalCell.numFmt = moneyFmt;
        totalCell.font = { bold: true };
        for (let c = 1; c <= 2 + employeeSheetMeta.length; c++) {
          const cell = r.getCell(c);
          if (c === 1) cell.alignment = { vertical: "middle", horizontal: "left" };
          cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        }
      });
      const mEnd = mStart + Math.max(schools.length - 1, 0);
      const rTotal = pv.getRow(mEnd + 1);
      rTotal.getCell(1).value = "TỔNG"; rTotal.getCell(1).font = { bold: true };
      employeeSheetMeta.forEach((meta, j) => {
        const cIdx = 2 + j;
        const cL = pv.getColumn(cIdx).letter;
        rTotal.getCell(cIdx).value = { formula: `SUM(${cL}${mStart}:${cL}${mEnd})` };
        rTotal.getCell(cIdx).numFmt = moneyFmt;
      });
      const totalColIdx = 2 + employeeSheetMeta.length;
      const totalL = pv.getColumn(totalColIdx).letter;
      rTotal.getCell(totalColIdx).value = { formula: `SUM(${totalL}${mStart}:${totalL}${mEnd})` };
      rTotal.getCell(totalColIdx).numFmt = moneyFmt;
      for (let c = 1; c <= totalColIdx; c++) {
        rTotal.getCell(c).border = { top: { style: "medium" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        rTotal.getCell(c).alignment = { vertical: "middle", horizontal: c === 1 ? "left" : "center" };
      }

      pv.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
      pv.columns = [
        { width: 20 },
        ...Array(employeeSheetMeta.length).fill({ width: 16 }),
        { width: 18 },
      ];

      // === WRITE FILE ===
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `so_y_te_${month}_cong_thuc_pivot_config.xlsx`; a.click();
      URL.revokeObjectURL(url);
      alert("✅ Xuất Excel: giá động qua sheet Cấu hình + Pivot + header/footer + logo!");
    } catch (err) {
      console.error(err);
      alert("❌ Xuất Excel thất bại.");
    }
  };

  // ==== LOGIN UI ====
  if (!user)
    return (
      <div className="login-page">
        <div className="login-box" style={{ maxWidth: 420 }}>
          <h2>🔐 {isSignup ? "Đăng ký tài khoản" : "Đăng nhập hệ thống"}</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button onClick={() => { setIsSignup(false); setAuthMsg(""); }} className={!isSignup ? "btn-primary" : "btn-secondary"}>Đăng nhập</button>
            <button onClick={() => { setIsSignup(true); setAuthMsg(""); }} className={isSignup ? "btn-primary" : "btn-secondary"}>Đăng ký</button>
          </div>
          {!isSignup ? (
            <>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mật khẩu" onKeyDown={(e) => e.key === "Enter" && login()} />
              <button onClick={login} className="btn-primary" disabled={loadingAuth}>{loadingAuth ? "..." : "Đăng nhập"}</button>
              <button onClick={resetPassword} className="btn-link" style={{ marginTop: 8 }}>Quên mật khẩu?</button>
              {authMsg && <div style={{ marginTop: 10, color: authMsg.startsWith("✅") || authMsg.startsWith("✉️") ? "#198754" : "#dc3545" }}>{authMsg}</div>}
            </>
          ) : (
            <>
              <input value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="Email" />
              <input type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder="Mật khẩu (≥ 6 ký tự)" />
              <input type="password" value={regConfirm} onChange={(e) => setRegConfirm(e.target.value)} placeholder="Xác nhận mật khẩu" onKeyDown={(e) => e.key === "Enter" && register()} />
              <button onClick={register} className="btn-success" disabled={loadingAuth}>{loadingAuth ? "..." : "Tạo tài khoản"}</button>
              {authMsg && <div style={{ marginTop: 10, color: authMsg.startsWith("✅") ? "#198754" : "#dc3545" }}>{authMsg}</div>}
            </>
          )}
        </div>
      </div>
    );

  // ==== MAIN UI ====
  return (
    <div className="dashboard">
      <div className="topbar">
        <h1>🏥 Quản Lý Sổ Y Tế Khám Trẻ Em</h1>
        <div className="user-info">
          <span>{user.email}</span>
          <button onClick={logout} className="btn-logout">Đăng xuất</button>
        </div>
      </div>

      <div className="toolbar">
        <label>Tháng:</label>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <label>Giá/sổ (nghìn):</label>
        <input
          type="number"
          value={pricePerBook}
          onChange={(e) => setPricePerBook(Number.isFinite(parseFloat(e.target.value)) ? parseFloat(e.target.value) : 0)}
          className="short-input"
        />
        <button onClick={exportExcel} className="btn-secondary">⬇️ Xuất Excel (giá động + Pivot)</button>
      </div>

      {/* Nhân viên */}
      <div className="section">
        <h2>👥 Danh sách nhân viên</h2>
        <div className="add-row">
          <input placeholder="Tên nhân viên" value={newEmployeeName} onChange={(e) => setNewEmployeeName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEmployee()} />
          <button onClick={addEmployee} className="btn-primary">➕ Thêm NV</button>
        </div>
        <div className="tag-list">
          {employees.map((emp) => (
            <div key={emp.id} className="tag employee-tag">
              <span>👤 {emp.name}</span>
              <button onClick={() => deleteEmployee(emp.id)}>✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Trường & Lớp */}
      <div className="section">
        <h2>🏫 Danh sách trường học</h2>
        <div className="add-row">
          {schools.length > 0 && (
            <>
              <select value={selectedSchoolForClass} onChange={(e) => { setSelectedSchoolForClass(e.target.value); setNewSchoolName(""); }} style={{ minWidth: 200 }}>
                <option value="">--Chọn trường (hoặc gõ mới)--</option>
                {schools.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <span style={{ margin: "0 6px", color: "#666" }}>hoặc</span>
            </>
          )}
          <input placeholder="Tên trường" value={newSchoolName} onChange={(e) => { setNewSchoolName(e.target.value); setSelectedSchoolForClass(""); }} onKeyDown={(e) => e.key === "Enter" && addClass()} />
          <input placeholder="Tên lớp (VD: 1A, 2B...)" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addClass()} />
          <button onClick={addClass} className="btn-primary">➕ Thêm lớp</button>
        </div>
        <div className="tag-list">
          {classes.map((c) => (
            <div key={c.id} className="tag class-tag">
              <span>- {c.school} - {c.name}</span>
              <button onClick={() => deleteClass(c.id)}>✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Nhập sổ */}
      <div className="section">
        <h2>📝 Nhập sổ chi tiết theo đợt</h2>
        <div className="form-row entry-form">
          <label>Nhân viên:</label>
          <select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)}>
            <option value="">--Chọn--</option>
            {employees.map((emp) => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
          </select>

          <label>Ngày:</label>
          <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
            <option value="">--Ngày--</option>
            {Array.from({ length: daysInMonth }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select>

          <label>Trường:</label>
          <select value={selectedSchool} onChange={(e) => { setSelectedSchool(e.target.value); setInputClass(""); }}>
            <option value="">--Chọn--</option>
            {schools.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <label>Lớp:</label>
          {selectedSchool ? (
            <select value={inputClass} onChange={(e) => setInputClass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEntry()}>
              <option value="">--Chọn lớp--</option>
              {classes.filter((c) => c.school === selectedSchool).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          ) : <select disabled><option>Chọn trường trước</option></select>}

          <label>Số sổ:</label>
          <input type="number" value={inputBooks} onChange={(e) => setInputBooks(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEntry()} />

          <label>Ghi chú:</label>
          <input value={inputNote} onChange={(e) => setInputNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEntry()} />

          <div />
          <button onClick={addEntry} className="btn-success">➕ Thêm</button>
        </div>

        {/* Lịch sử */}
        <div className="entries-history">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3>Lịch sử nhập sổ ({entries.length} đợt)</h3>
            {selectedEntries.size > 0 && (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ color: "#dc3545", fontWeight: "bold" }}>Đã chọn: {selectedEntries.size}</span>
                <button onClick={deleteSelectedEntries} className="btn-danger">🗑️ Xóa ({selectedEntries.size})</button>
                <button onClick={() => setSelectedEntries(new Set())} className="btn-secondary" style={{ padding: "4px 10px", fontSize: 12 }}>Bỏ chọn</button>
              </div>
            )}
          </div>
          <div className="table-container">
            <table className="history-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input type="checkbox" checked={selectedEntries.size > 0 && selectedEntries.size === entries.length} onChange={selectAllEntries} />
                  </th>
                  <th>NV</th>
                  <th>Ngày</th>
                  <th>Trường</th>
                  <th>Lớp</th>
                  <th>Số sổ</th>
                  <th>Ghi chú</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} style={{ backgroundColor: selectedEntries.has(entry.id) ? "#fff3cd" : "inherit" }}>
                    <td><input type="checkbox" checked={selectedEntries.has(entry.id)} onChange={() => toggleSelectEntry(entry.id)} /></td>
                    <td>{entry.employee}</td>
                    <td>{entry.day}</td>
                    <td>{entry.school}</td>
                    <td>{entry.class}</td>
                    <td onClick={() => editEntry(entry)} style={{ cursor: "pointer", fontWeight: "bold", color: "#007bff" }}>{entry.books}</td>
                    <td>{entry.note || "-"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                        <button onClick={() => editEntry(entry)} className="btn-edit">✏️</button>
                        <button onClick={() => deleteEntry(entry.id)} className="btn-delete">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && <tr><td colSpan="8" style={{ textAlign: "center", color: "#888" }}>Chưa có dữ liệu</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bảng tổng theo nhân viên */}
      {Object.keys(employeeSummaryTables).map((empName) => {
        const empTable = employeeSummaryTables[empName];
        const empTotal = empTable.reduce((s, r) => s + r.days.reduce((a, b) => a + b, 0), 0);
        const empMoney = Math.round(empTotal * pricePerBook * 1000);
        return (
          <div key={empName} className="section employee-table-section">
            <h2>📊 Bảng tổng - Nhân viên: <strong style={{ color: "#007bff" }}>{empName}</strong></h2>
            <p className="hint-text">💡 Click số trong ô để xem chi tiết</p>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Trường</th>
                    <th>Lớp</th>
                    {Array.from({ length: 31 }, (_, i) => <th key={i}>{i + 1}</th>)}
                    <th>Tổng</th>
                    <th>Tiền (VND)</th>
                  </tr>
                </thead>
                <tbody>
                  {empTable.map((row, idx) => {
                    const total = row.days.reduce((a, b) => a + b, 0);
                    const money = Math.round(total * pricePerBook * 1000);
                    return (
                      <tr key={idx}>
                        <td><strong>{row.school}</strong></td>
                        <td>{row.class}</td>
                        {row.days.map((v, di) => (
                          <td key={di} onClick={() => v > 0 && openDetailModal(di + 1, row.school)} className={v > 0 ? "clickable-cell" : ""}>
                            {v > 0 ? v : "-"}
                          </td>
                        ))}
                        <td><strong>{total}</strong></td>
                        <td>{formatVND(money)}</td>
                      </tr>
                    );
                  })}
                  <tr className="total-row">
                    <td colSpan="2"><strong>TỔNG CỘNG</strong></td>
                    {Array.from({ length: 31 }, (_, i) => {
                      const dayTotal = empTable.reduce((s, r) => s + r.days[i], 0);
                      return <td key={i}><strong>{dayTotal || ""}</strong></td>;
                    })}
                    <td><strong>{empTotal}</strong></td>
                    <td><strong>{formatVND(empMoney)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Bảng tổng chung */}
      <div className="section">
        <h2>📊 Bảng tổng</h2>
        <p className="hint-text">💡 Click vào số trong ô để xem chi tiết</p>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Trường</th>
                <th>Lớp</th>
                {Array.from({ length: 31 }, (_, i) => <th key={i}>{i + 1}</th>)}
                <th>Tổng</th>
                <th>Tiền (VND)</th>
              </tr>
            </thead>
            <tbody>
              {summaryTable.map((row, idx) => {
                const total = row.days.reduce((a, b) => a + b, 0);
                const money = Math.round(total * pricePerBook * 1000);
                return (
                  <tr key={idx}>
                    <td><strong>{row.school}</strong></td>
                    <td>{row.class}</td>
                    {row.days.map((v, di) => (
                      <td key={di} onClick={() => v > 0 && openDetailModal(di + 1, row.school)} className={v > 0 ? "clickable-cell" : ""}>
                        {v > 0 ? v : "-"}
                      </td>
                    ))}
                    <td><strong>{total}</strong></td>
                    <td>{formatVND(money)}</td>
                  </tr>
                );
              })}
              {summaryTable.length > 0 && (
                <tr className="total-row">
                  <td colSpan="2"><strong>TỔNG CỘNG</strong></td>
                  {Array.from({ length: 31 }, (_, i) => {
                    const dayTotal = summaryTable.reduce((s, r) => s + r.days[i], 0);
                    return <td key={i}><strong>{dayTotal || ""}</strong></td>;
                  })}
                  <td><strong>{totalBooks}</strong></td>
                  <td><strong>{formatVND(totalMoney)}</strong></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      <div className="summary">
        <div><b>Tổng số sổ (tất cả):</b> {totalBooks}</div>
        <div><b>Tổng tiền (tất cả):</b> {formatVND(totalMoney)}</div>
      </div>

      {/* Modal */}
      {modalDetailData && (
        <div className="modal-overlay" onClick={closeDetailModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Chi tiết ngày {modalDetailData.day} - {modalDetailData.school}</h3>
              <button onClick={closeDetailModal} className="modal-close">✕</button>
            </div>
            <div className="modal-body">
              <table className="detail-table">
                <thead>
                  <tr>
                    <th>Nhân viên</th>
                    <th>Lớp</th>
                    <th>Số sổ</th>
                    <th>Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {modalDetailData.details.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.employee}</td>
                      <td>{item.class}</td>
                      <td>{item.books}</td>
                      <td>{item.notes.join(", ") || "-"}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan="2"><strong>Tổng</strong></td>
                    <td><strong>{modalDetailData.totalBooks}</strong></td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="modal-footer">
              <button onClick={closeDetailModal} className="btn-primary">Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
