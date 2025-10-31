import React, { useEffect, useState, useMemo } from "react";
import {
  initializeApp,
  getApps,
  getApp,
} from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import * as XLSX from "xlsx";
import "./App.css";

const firebaseConfig = {
  apiKey: "AIzaSyCHv-swPrzkKKQxuB0nZG-jQ4s4ecrbLUw",
  authDomain: "web-4de0f.firebaseapp.com",
  projectId: "web-4de0f",
  storageBucket: "web-4de0f.appspot.com",
  messagingSenderId: "766258113961",
  appId: "1:766258113961:web:b085d899d1d640998fa8b8",
};

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function SalaryApp() {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null);
  const [month, setMonth] = useState(getCurrentMonth());
  const [employees, setEmployees] = useState([]);
  const [classes, setClasses] = useState([]);
  const [entries, setEntries] = useState([]);
  const [pricePerBook, setPricePerBook] = useState(3.5);
  
  // Form states
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newSchoolName, setNewSchoolName] = useState("");
  const [selectedSchoolForClass, setSelectedSchoolForClass] = useState(""); // Dropdown cho trường
  const [newClassName, setNewClassName] = useState("");
  
  // Entry form states
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedSchool, setSelectedSchool] = useState("");
  const [inputClass, setInputClass] = useState("");
  const [inputBooks, setInputBooks] = useState("");
  const [inputNote, setInputNote] = useState("");
  
  // Modal state
  const [detailModal, setDetailModal] = useState(null); // {day, school}
  
  // Filter state
  const [filterEmployee, setFilterEmployee] = useState(""); // Filter by employee
  
  // Batch delete state
  const [selectedEntries, setSelectedEntries] = useState(new Set()); // Set of entry IDs
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ==== INIT FIREBASE ====
  useEffect(() => {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    setDb(getFirestore(app));
    setAuth(getAuth(app));
  }, []);

  // ==== AUTH ====
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, [auth]);

  const login = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      alert("❌ Sai tài khoản hoặc mật khẩu!");
    }
  };
  const logout = async () => await signOut(auth);

  // ==== FIRESTORE LISTEN ====
  useEffect(() => {
    if (!db || !user) return;
    
    // Listen to employees
    const empPath = `users/${user.uid}/employees`;
    const unsubEmp = onSnapshot(collection(db, empPath), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setEmployees(data);
    });
    
    // Listen to classes
    const classPath = `users/${user.uid}/months/${month}/classes`;
    const unsubClass = onSnapshot(collection(db, classPath), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setClasses(data);
    });
    
    // Listen to entries
    const entryPath = `users/${user.uid}/months/${month}/entries`;
    const unsubEntry = onSnapshot(collection(db, entryPath), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setEntries(data.sort((a, b) => {
        // Sort by day desc, then by timestamp desc
        if (a.day !== b.day) return b.day - a.day;
        return (b.timestamp || 0) - (a.timestamp || 0);
      }));
    });
    
    return () => {
      unsubEmp();
      unsubClass();
      unsubEntry();
    };
  }, [db, month, user]);

  // ==== COMPUTED DATA ====
  const schools = useMemo(() => {
    const unique = [...new Set(classes.map((c) => c.school).filter(Boolean))];
    return unique.sort();
  }, [classes]);

  // Get classes for selected school
  const classesForSelectedSchool = useMemo(() => {
    if (!selectedSchool) return [];
    return classes
      .filter((c) => c.school === selectedSchool)
      .map((c) => c.name)
      .sort();
  }, [classes, selectedSchool]);

  // Filter entries by employee if filter is set
  const filteredEntries = useMemo(() => {
    if (!filterEmployee) return entries;
    return entries.filter((e) => e.employee === filterEmployee);
  }, [entries, filterEmployee]);

  // Calculate summary table from entries (with employee filter)
  const summaryTable = useMemo(() => {
    const table = {}; // {school_class_day: books}
    const detailMap = {}; // {school_class_day: [{employee, books, note}]}
    
    filteredEntries.forEach((entry) => {
      const key = `${entry.school}_${entry.class}_${entry.day}`;
      if (!table[key]) {
        table[key] = 0;
        detailMap[key] = [];
      }
      table[key] += entry.books || 0;
      detailMap[key].push({
        employee: entry.employee,
        books: entry.books || 0,
        note: entry.note || "",
      });
    });
    
    // Group by school-class
    const grouped = {};
    Object.keys(table).forEach((key) => {
      const [school, className, day] = key.split("_");
      const groupKey = `${school}_${className}`;
      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          school,
          class: className,
          days: Array(31).fill(0),
          details: Array(31).fill(null), // Store detail map for each day
        };
      }
      const dayIndex = parseInt(day) - 1;
      if (dayIndex >= 0 && dayIndex < 31) {
        grouped[groupKey].days[dayIndex] = table[key];
        grouped[groupKey].details[dayIndex] = detailMap[key];
      }
    });
    
    return Object.values(grouped);
  }, [filteredEntries]);

  // Statistics by employee: which schools and how many classes
  const employeeStats = useMemo(() => {
    const stats = {};
    entries.forEach((entry) => {
      const emp = entry.employee;
      if (!stats[emp]) {
        stats[emp] = {
          schools: new Set(),
          classes: new Map(), // Map: school_class -> class info
          totalBooks: 0,
        };
      }
      if (entry.school) stats[emp].schools.add(entry.school);
      if (entry.class && entry.school) {
        const key = `${entry.school}_${entry.class}`;
        if (!stats[emp].classes.has(key)) {
          stats[emp].classes.set(key, {
            school: entry.school,
            className: entry.class,
          });
        }
      }
      stats[emp].totalBooks += entry.books || 0;
    });
    
    return Object.keys(stats).map((emp) => {
      const classList = Array.from(stats[emp].classes.values());
      // Group classes by school for display
      const classesBySchool = {};
      classList.forEach((cls) => {
        if (!classesBySchool[cls.school]) {
          classesBySchool[cls.school] = [];
        }
        classesBySchool[cls.school].push(cls.className);
      });
      
      return {
        employee: emp,
        schools: Array.from(stats[emp].schools),
        classCount: stats[emp].classes.size,
        classesBySchool: classesBySchool, // {school: [class1, class2, ...]}
        totalBooks: stats[emp].totalBooks,
      };
    }).sort((a, b) => a.employee.localeCompare(b.employee));
  }, [entries]);

  // Calculate summary table for EACH employee separately
  const employeeSummaryTables = useMemo(() => {
    const tables = {};
    
    employees.forEach((emp) => {
      const empEntries = entries.filter((e) => e.employee === emp.name);
      if (empEntries.length === 0) return;
      
      const table = {}; // {school_class_day: books}
      const detailMap = {}; // {school_class_day: [{employee, books, note}]}
      
      empEntries.forEach((entry) => {
        const key = `${entry.school}_${entry.class}_${entry.day}`;
        if (!table[key]) {
          table[key] = 0;
          detailMap[key] = [];
        }
        table[key] += entry.books || 0;
        detailMap[key].push({
          employee: entry.employee,
          books: entry.books || 0,
          note: entry.note || "",
        });
      });
      
      // Group by school-class
      const grouped = {};
      Object.keys(table).forEach((key) => {
        const [school, className, day] = key.split("_");
        const groupKey = `${school}_${className}`;
        if (!grouped[groupKey]) {
          grouped[groupKey] = {
            school,
            class: className,
            days: Array(31).fill(0),
            details: Array(31).fill(null),
          };
        }
        const dayIndex = parseInt(day) - 1;
        if (dayIndex >= 0 && dayIndex < 31) {
          grouped[groupKey].days[dayIndex] = table[key];
          grouped[groupKey].details[dayIndex] = detailMap[key];
        }
      });
      
      tables[emp.name] = Object.values(grouped);
    });
    
    return tables;
  }, [entries, employees]);

  const totalBooks = useMemo(() => {
    return summaryTable.reduce((sum, row) => {
      return sum + row.days.reduce((a, b) => a + b, 0);
    }, 0);
  }, [summaryTable]);

  const totalMoney = useMemo(
    () => Math.round(totalBooks * pricePerBook * 1000),
    [totalBooks, pricePerBook]
  );

  // ==== CRUD OPERATIONS ====
  const addEmployee = async () => {
    if (!newEmployeeName.trim() || !user) return alert("⚠️ Vui lòng nhập tên nhân viên!");
    const id = `emp_${Date.now()}`;
    const ref = doc(db, `users/${user.uid}/employees`, id);
    await setDoc(ref, { name: newEmployeeName.trim() });
    setNewEmployeeName("");
  };

  const deleteEmployee = async (id) => {
    if (window.confirm("🗑️ Xóa nhân viên này?")) {
      await deleteDoc(doc(db, `users/${user.uid}/employees`, id));
    }
  };

  const addClass = async () => {
    const schoolToAdd = selectedSchoolForClass || newSchoolName.trim();
    if (!schoolToAdd || !newClassName.trim() || !user) 
      return alert("⚠️ Vui lòng chọn/nhập trường và lớp!");
    const id = `class_${Date.now()}`;
    const ref = doc(db, `users/${user.uid}/months/${month}/classes`, id);
    await setDoc(ref, { 
      school: schoolToAdd,
      name: newClassName.trim(),
    });
    // Giữ nguyên trường đã chọn để tiếp tục thêm lớp, chỉ xóa tên lớp
    setNewClassName("");
    // Chỉ reset nếu dùng input text cho trường
    if (!selectedSchoolForClass) {
      setNewSchoolName("");
    }
  };

  const deleteClass = async (id) => {
    if (window.confirm("🗑️ Xóa lớp này?")) {
      await deleteDoc(doc(db, `users/${user.uid}/months/${month}/classes`, id));
    }
  };

  const addEntry = async () => {
    if (!user || !selectedEmployee || !selectedDay || !selectedSchool || !inputClass.trim() || !inputBooks) {
      return alert("⚠️ Vui lòng nhập đầy đủ thông tin!");
    }
    
    const day = parseInt(selectedDay);
    const books = parseInt(inputBooks) || 0;
    const classname = inputClass.trim();
    
    // Kiểm tra xem đã có entry của nhân viên này cho trường/lớp/ngày này chưa
    const existingEntry = entries.find(
      (e) => 
        e.employee === selectedEmployee &&
        e.day === day &&
        e.school === selectedSchool &&
        e.class === classname
    );
    
    if (existingEntry) {
      // Nếu đã có, hỏi có muốn sửa không
      const confirm = window.confirm(
        `Đã có ${existingEntry.books} sổ của nhân viên "${selectedEmployee}" cho trường "${selectedSchool}", lớp "${classname}", ngày ${day}.\n\nBạn muốn SỬA thành ${books} sổ?\n\n(Cancel = Giữ nguyên, OK = Sửa)`
      );
      
      if (confirm) {
        // Sửa entry hiện có
        const ref = doc(db, `users/${user.uid}/months/${month}/entries`, existingEntry.id);
        await updateDoc(ref, {
          books: books,
          note: inputNote.trim() || existingEntry.note,
          timestamp: Date.now(), // Cập nhật timestamp
        });
        // Reset form
        setInputClass("");
        setInputBooks("");
        setInputNote("");
        return;
      } else {
        // Không sửa, giữ nguyên
        setInputClass("");
        setInputBooks("");
        setInputNote("");
        return;
      }
    }
    
    // Nếu chưa có, tạo mới
    const id = `entry_${Date.now()}`;
    const ref = doc(db, `users/${user.uid}/months/${month}/entries`, id);
    await setDoc(ref, {
      employee: selectedEmployee,
      day: day,
      school: selectedSchool,
      class: classname,
      books: books,
      note: inputNote.trim() || "",
      timestamp: Date.now(),
    });
    // Reset form
    setInputClass("");
    setInputBooks("");
    setInputNote("");
  };

  const deleteEntry = async (id) => {
    if (window.confirm("🗑️ Xóa đợt nhập này?")) {
      await deleteDoc(doc(db, `users/${user.uid}/months/${month}/entries`, id));
    }
  };

  const toggleSelectEntry = (id) => {
    const newSelected = new Set(selectedEntries);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedEntries(newSelected);
  };

  const selectAllEntries = () => {
    if (selectedEntries.size === entries.length) {
      setSelectedEntries(new Set());
    } else {
      setSelectedEntries(new Set(entries.map((e) => e.id)));
    }
  };

  const deleteSelectedEntries = async () => {
    if (selectedEntries.size === 0) {
      alert("⚠️ Vui lòng chọn entry để xóa!");
      return;
    }
    
    const confirmMsg = selectedEntries.size === 1
      ? "🗑️ Xóa 1 đợt nhập này?"
      : `🗑️ Xóa ${selectedEntries.size} đợt nhập đã chọn?`;
    
    if (window.confirm(confirmMsg)) {
      const promises = Array.from(selectedEntries).map((id) =>
        deleteDoc(doc(db, `users/${user.uid}/months/${month}/entries`, id))
      );
      await Promise.all(promises);
      setSelectedEntries(new Set());
    }
  };

  const editEntry = async (entry) => {
    const newBooks = prompt(
      `✏️ Sửa số sổ\n\nNhân viên: ${entry.employee}\nTrường: ${entry.school}\nLớp: ${entry.class}\nNgày: ${entry.day}\n\nSố sổ hiện tại: ${entry.books}\nNhập số sổ mới:`,
      entry.books
    );
    if (newBooks === null || newBooks === "") return;
    
    const booksNum = parseInt(newBooks);
    if (isNaN(booksNum) || booksNum < 0) {
      alert("⚠️ Vui lòng nhập số hợp lệ!");
      return;
    }

    const newNote = prompt(
      `Ghi chú hiện tại: ${entry.note || "(không có)"}\n\nNhập ghi chú mới (để trống = giữ nguyên):`,
      entry.note || ""
    );
    
    const ref = doc(db, `users/${user.uid}/months/${month}/entries`, entry.id);
    await updateDoc(ref, {
      books: booksNum,
      note: newNote !== null ? newNote.trim() : entry.note,
      timestamp: Date.now(),
    });
  };

  // ==== MODAL FUNCTIONS ====
  const openDetailModal = (day, school) => {
    setDetailModal({ day, school });
  };

  const closeDetailModal = () => {
    setDetailModal(null);
  };

  // Get detail data for modal
  const modalDetailData = useMemo(() => {
    if (!detailModal) return null;
    
    const { day, school } = detailModal;
    const dayEntries = entries.filter(
      (e) => e.day === day && e.school === school
    );
    
    // Group by employee and class
    const grouped = {};
    dayEntries.forEach((entry) => {
      const key = `${entry.employee}_${entry.class}`;
      if (!grouped[key]) {
        grouped[key] = {
          employee: entry.employee,
          class: entry.class,
          books: 0,
          notes: [],
        };
      }
      grouped[key].books += entry.books || 0;
      if (entry.note) {
        grouped[key].notes.push(entry.note);
      }
    });
    
    const detailList = Object.values(grouped).sort((a, b) => {
      if (a.employee !== b.employee) return a.employee.localeCompare(b.employee);
      return a.class.localeCompare(b.class);
    });
    
    const totalBooks = detailList.reduce((sum, item) => sum + item.books, 0);
    
    return {
      day,
      school,
      details: detailList,
      totalBooks,
    };
  }, [detailModal, entries]);

  // ==== EXPORT EXCEL ====
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    
    // Helper function to create styled worksheet
    const createStyledSheet = (header, rows, totalRow, sheetTitle, isEmployeeSheet = false) => {
      // Create title and info rows
      const titleRow = ["BÁO CÁO SỔ Y TẾ KHÁM TRẺ EM"];
      const infoRow1 = [`Tháng: ${month}`];
      const infoRow2 = isEmployeeSheet ? [`Nhân viên: ${sheetTitle}`] : ["Tổng hợp tất cả nhân viên"];
      const infoRow3 = [`Giá/sổ: ${pricePerBook.toLocaleString('vi-VN')} nghìn VND`];
      const emptyRow = [""];
      
      // Calculate summary info
      const totalBooks = totalRow[totalRow.length - 2] || 0;
      const totalMoney = totalRow[totalRow.length - 1] || 0;
      const summaryRow = [`Tổng số sổ: ${totalBooks} sổ | Tổng tiền: ${formatVND(totalMoney)}`];
      
      // Combine all rows
      const allRows = [
        titleRow,
        infoRow1,
        infoRow2,
        infoRow3,
        emptyRow,
        summaryRow,
        emptyRow,
        header,
        ...rows,
        totalRow
      ];
      
      const ws = XLSX.utils.aoa_to_sheet(allRows);
      
      // Calculate range (skip title rows)
      const headerRowIndex = 7; // Header is at row 8 (0-indexed = 7)
      const dataStartRow = 8;
      const totalRowIndex = dataStartRow + rows.length;
      
      const range = XLSX.utils.decode_range(ws['!ref']);
      
      // Style title row (row 0)
      const titleCell = XLSX.utils.encode_cell({ r: 0, c: 0 });
      if (ws[titleCell]) {
        ws[titleCell].s = {
          fill: { fgColor: { rgb: "007bff" } },
          font: { bold: true, color: { rgb: "FFFFFF" }, sz: 16 },
          alignment: { horizontal: "center", vertical: "center" },
        };
      }
      
      // Merge title cells
      if (!ws['!merges']) ws['!merges'] = [];
      ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: range.e.c } });
      
      // Style info rows (rows 1-3, 5)
      for (let row = 1; row <= 3; row++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: 0 });
        if (ws[cellAddress]) {
          ws[cellAddress].s = {
            font: { bold: true, sz: 11 },
            alignment: { horizontal: "left", vertical: "center" },
          };
        }
        // Merge info cells
        ws['!merges'].push({ s: { r: row, c: 0 }, e: { r: row, c: range.e.c } });
      }
      
      // Style summary row (row 5)
      const summaryCell = XLSX.utils.encode_cell({ r: 5, c: 0 });
      if (ws[summaryCell]) {
        ws[summaryCell].s = {
          fill: { fgColor: { rgb: "E7F3FF" } },
          font: { bold: true, sz: 12, color: { rgb: "007bff" } },
          alignment: { horizontal: "center", vertical: "center" },
        };
        ws['!merges'].push({ s: { r: 5, c: 0 }, e: { r: 5, c: range.e.c } });
      }
      
      // Style header row (row 7)
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: headerRowIndex, c: col });
        if (!ws[cellAddress]) continue;
        
        ws[cellAddress].s = {
          fill: { fgColor: { rgb: "4472C4" } }, // Blue background
          font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 }, // White bold text
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } },
          },
        };
      }
      
      // Style data rows
      for (let row = 0; row < rows.length; row++) {
        const actualRowIndex = dataStartRow + row;
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: actualRowIndex, c: col });
          if (!ws[cellAddress]) continue;
          
          const isEvenRow = row % 2 === 0;
          ws[cellAddress].s = {
            fill: { fgColor: { rgb: isEvenRow ? "F2F2F2" : "FFFFFF" } }, // Alternate row colors
            font: { sz: 10 },
            alignment: { 
              horizontal: col < 2 ? "left" : "center", 
              vertical: "center" 
            },
            border: {
              top: { style: "thin", color: { rgb: "CCCCCC" } },
              bottom: { style: "thin", color: { rgb: "CCCCCC" } },
              left: { style: "thin", color: { rgb: "CCCCCC" } },
              right: { style: "thin", color: { rgb: "CCCCCC" } },
            },
          };
          
          // Bold for school column
          if (col === 0) {
            ws[cellAddress].s.font.bold = true;
          }
          
          // Format money column
          if (col === range.e.c) {
            ws[cellAddress].s.numFmt = '#,##0 "₫"';
            ws[cellAddress].s.font.color = { rgb: "006100" }; // Green for money
          }
        }
      }
      
      // Style total row
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: totalRowIndex, c: col });
        if (!ws[cellAddress]) continue;
        
        ws[cellAddress].s = {
          fill: { fgColor: { rgb: "FFF2CC" } }, // Yellow background
          font: { bold: true, sz: 11, color: { rgb: "000000" } },
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "medium", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } },
          },
        };
        
        // Format money column in total row
        if (col === range.e.c) {
          ws[cellAddress].s.numFmt = '#,##0 "₫"';
          ws[cellAddress].s.font.color = { rgb: "C65911" }; // Dark orange for total money
        }
      }
      
      // Freeze header row
      ws['!freeze'] = { xSplit: 0, ySplit: headerRowIndex + 1, topLeftCell: "A8", activePane: "bottomLeft" };
      
      // Set column widths
      ws['!cols'] = [
        { wch: 18 }, // Trường
        { wch: 12 }, // Lớp
        ...Array(31).fill({ wch: 7 }), // Các ngày
        { wch: 12 }, // Tổng Sổ
        { wch: 18 }, // Tiền
      ];
      
      // Set row heights
      ws['!rows'] = [
        { hpt: 25 }, // Title row
        { hpt: 18 }, // Info rows
        { hpt: 18 },
        { hpt: 18 },
        { hpt: 12 }, // Empty row
        { hpt: 20 }, // Summary row
        { hpt: 12 }, // Empty row
        { hpt: 22 }, // Header row
        ...Array(rows.length).fill({ hpt: 16 }), // Data rows
        { hpt: 20 }, // Total row
      ];
      
      return ws;
    };
    
    // Export each employee's table as a separate sheet
    Object.keys(employeeSummaryTables).forEach((empName) => {
      const empTable = employeeSummaryTables[empName];
      const header = ["Trường", "Lớp", ...Array.from({ length: 31 }, (_, i) => `Ngày ${i + 1}`), "Tổng Sổ", "Tiền (VND)"];
      const rows = empTable.map((row) => {
        const sum = row.days.reduce((a, b) => a + b, 0);
        const money = Math.round(sum * pricePerBook * 1000);
        return [row.school, row.class, ...row.days, sum, money];
      });
      
      const empTotal = empTable.reduce((sum, row) => {
        return sum + row.days.reduce((a, b) => a + b, 0);
      }, 0);
      const empMoney = Math.round(empTotal * pricePerBook * 1000);
      const totalRow = ["", "TỔNG", ...Array(31).fill(""), empTotal, empMoney];
      
      const ws = createStyledSheet(header, rows, totalRow, empName, true);
      XLSX.utils.book_append_sheet(wb, ws, empName);
    });
    
    // Also add a summary sheet with all data combined
    const header = ["Trường", "Lớp", ...Array.from({ length: 31 }, (_, i) => `Ngày ${i + 1}`), "Tổng Sổ", "Tiền (VND)"];
    const rows = summaryTable.map((row) => {
      const sum = row.days.reduce((a, b) => a + b, 0);
      const money = Math.round(sum * pricePerBook * 1000);
      return [row.school, row.class, ...row.days, sum, money];
    });
    const totalRow = ["", "TỔNG", ...Array(31).fill(""), totalBooks, totalMoney];
    const ws = createStyledSheet(header, rows, totalRow, "Tổng chung", false);
    
    XLSX.utils.book_append_sheet(wb, ws, "Tổng chung");
    
    const filename = `so_y_te_${month}.xlsx`;
    XLSX.writeFile(wb, filename);
    
    alert(`✅ Đã xuất Excel thành công!\n\n- ${Object.keys(employeeSummaryTables).length} sheet theo nhân viên\n- 1 sheet tổng chung\n\nFile: ${filename}`);
  };

  const formatVND = (v) => v.toLocaleString("vi-VN") + " ₫";

  // ==== LOGIN UI ====
  if (!user)
    return (
      <div className="login-page">
        <div className="login-box">
          <h2>🔐 Đăng nhập hệ thống</h2>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mật khẩu"
          />
          <button onClick={login} className="btn-primary">Đăng nhập</button>
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
          onChange={(e) => setPricePerBook(parseFloat(e.target.value) || 0)}
          className="short-input"
        />
        <button onClick={exportExcel} className="btn-secondary">⬇️ Xuất Excel</button>
      </div>

      {/* Danh sách nhân viên */}
      <div className="section">
        <h2>👥 Danh sách nhân viên</h2>
        <div className="add-row">
          <input
            placeholder="Tên nhân viên (VD: Anh, Bình, Chi...)"
            value={newEmployeeName}
            onChange={(e) => setNewEmployeeName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addEmployee()}
          />
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

      {/* Thống kê theo nhân viên */}
      {employeeStats.length > 0 && (
        <div className="section stats-section">
          <h2>📊 Thống kê theo nhân viên</h2>
          <div className="employee-stats-grid">
            {employeeStats.map((stat) => (
              <div key={stat.employee} className="stat-card">
                <div className="stat-header">
                  <strong>👤 {stat.employee}</strong>
                </div>
                <div className="stat-body">
                  <div><b>Trường:</b> {stat.schools.length > 0 ? stat.schools.join(", ") : "Chưa có"}</div>
                  <div><b>Số lớp:</b> {stat.classCount} lớp</div>
                  <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e0e0e0' }}>
                    <b>Danh sách lớp:</b>
                    {stat.schools.length > 0 ? (
                      <div style={{ marginTop: '5px' }}>
                        {stat.schools.map((school) => {
                          const classes = stat.classesBySchool[school] || [];
                          if (classes.length === 0) return null;
                          return (
                            <div key={school} style={{ marginTop: '4px', fontSize: '13px', color: '#555' }}>
                              <strong style={{ color: '#007bff' }}>{school}:</strong> {classes.sort().join(", ")}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span style={{ color: '#999' }}> Chưa có</span>
                    )}
                  </div>
                  <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e0e0e0' }}>
                    <div><b>Tổng sổ:</b> {stat.totalBooks} sổ</div>
                    <div><b>Tiền:</b> {formatVND(Math.round(stat.totalBooks * pricePerBook * 1000))}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Danh sách trường học */}
      <div className="section">
        <h2>🏫 Danh sách trường học</h2>
        <div className="add-row">
          {schools.length > 0 ? (
            <>
              <select 
                value={selectedSchoolForClass} 
                onChange={(e) => {
                  setSelectedSchoolForClass(e.target.value);
                  setNewSchoolName(""); // Clear text input when using dropdown
                }}
                style={{ minWidth: '200px' }}
              >
                <option value="">--Chọn trường (hoặc gõ mới)--</option>
                {schools.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <span style={{ margin: '0 5px', color: '#666' }}>hoặc</span>
            </>
          ) : null}
          <input
            placeholder="Tên trường (VD: TH72, TH73...)"
            value={newSchoolName}
            onChange={(e) => {
              setNewSchoolName(e.target.value);
              setSelectedSchoolForClass(""); // Clear dropdown when typing
            }}
            onKeyDown={(e) => e.key === "Enter" && addClass()}
          />
          <input
            placeholder="Tên lớp (VD: 1A, 2B...)"
            value={newClassName}
            onChange={(e) => setNewClassName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addClass()}
          />
          <button onClick={addClass} className="btn-primary">➕ Thêm lớp</button>
        </div>
        {selectedSchoolForClass && (
          <p style={{ marginTop: '8px', fontSize: '14px', color: '#28a745', fontStyle: 'italic' }}>
            ✓ Đang thêm lớp cho trường: <strong>{selectedSchoolForClass}</strong>
          </p>
        )}
        <div className="tag-list">
          {classes.map((c) => (
            <div key={c.id} className="tag class-tag">
              <span>- {c.school} - {c.name}</span>
              <button onClick={() => deleteClass(c.id)}>✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Nhập sổ chi tiết theo đợt */}
      <div className="section">
        <h2>📝 Nhập sổ chi tiết theo đợt</h2>
        <div className="form-row entry-form">
          <label>Nhân viên:</label>
          <select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)}>
            <option value="">--Chọn--</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.name}>{emp.name}</option>
            ))}
          </select>
          
          <label>Ngày:</label>
          <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
            <option value="">--Ngày--</option>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </select>
          
          <label>Trường:</label>
          <select 
            value={selectedSchool} 
            onChange={(e) => {
              setSelectedSchool(e.target.value);
              setInputClass(""); // Reset class when school changes
            }}
          >
            <option value="">--Chọn--</option>
            {schools.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          
          <label>Lớp:</label>
          {selectedSchool ? (
            <select
              value={inputClass}
              onChange={(e) => setInputClass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addEntry()}
            >
              <option value="">--Chọn lớp--</option>
              {classesForSelectedSchool.map((className) => (
                <option key={className} value={className}>{className}</option>
              ))}
            </select>
          ) : (
            <select disabled>
              <option>Vui lòng chọn trường trước</option>
            </select>
          )}
          
          <label>Số sổ:</label>
          <input
            type="number"
            placeholder="Số sổ"
            value={inputBooks}
            onChange={(e) => setInputBooks(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addEntry()}
          />
          
          <label>Ghi chú:</label>
          <input
            type="text"
            placeholder="Đợt 1..."
            value={inputNote}
            onChange={(e) => setInputNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addEntry()}
          />
          
          <div></div>
          <button onClick={addEntry} className="btn-success">➕ Thêm</button>
        </div>

        {/* Lịch sử nhập sổ */}
        <div className="entries-history">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3>Lịch sử nhập sổ ({entries.length} đợt)</h3>
            {selectedEntries.size > 0 && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ color: '#dc3545', fontWeight: 'bold' }}>
                  Đã chọn: {selectedEntries.size} đợt
                </span>
                <button 
                  onClick={deleteSelectedEntries}
                  className="btn-danger"
                  title="Xóa các đợt đã chọn"
                >
                  🗑️ Xóa ({selectedEntries.size})
                </button>
                <button 
                  onClick={() => setSelectedEntries(new Set())}
                  className="btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '12px' }}
                >
                  Bỏ chọn
                </button>
              </div>
            )}
          </div>
          <div className="table-container">
            <table className="history-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={selectedEntries.size > 0 && selectedEntries.size === entries.length}
                      onChange={selectAllEntries}
                      title="Chọn tất cả"
                    />
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
                  <tr 
                    key={entry.id}
                    style={{ 
                      backgroundColor: selectedEntries.has(entry.id) ? '#fff3cd' : 'inherit'
                    }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedEntries.has(entry.id)}
                        onChange={() => toggleSelectEntry(entry.id)}
                      />
                    </td>
                    <td>{entry.employee}</td>
                    <td>{entry.day}</td>
                    <td>{entry.school}</td>
                    <td>{entry.class}</td>
                    <td 
                      onClick={() => editEntry(entry)}
                      style={{ cursor: 'pointer', fontWeight: 'bold', color: '#007bff' }}
                      title="Click để sửa số sổ"
                    >
                      {entry.books}
                    </td>
                    <td>{entry.note || "-"}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                        <button 
                          onClick={() => editEntry(entry)} 
                          className="btn-edit"
                          title="Sửa"
                        >
                          ✏️
                        </button>
                        <button 
                          onClick={() => deleteEntry(entry.id)} 
                          className="btn-delete"
                          title="Xóa"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bảng tổng theo từng nhân viên */}
      {Object.keys(employeeSummaryTables).length > 0 && (
        <>
          {Object.keys(employeeSummaryTables).map((empName) => {
            const empTable = employeeSummaryTables[empName];
            const empTotal = empTable.reduce((sum, row) => {
              return sum + row.days.reduce((a, b) => a + b, 0);
            }, 0);
            const empMoney = Math.round(empTotal * pricePerBook * 1000);
            
            return (
              <div key={empName} className="section employee-table-section">
                <h2>📊 Bảng tổng - Nhân viên: <strong style={{color: '#007bff'}}>{empName}</strong></h2>
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
                      {empTable.map((row, idx) => {
                        const total = row.days.reduce((a, b) => a + b, 0);
                        const money = Math.round(total * pricePerBook * 1000);
                        return (
                          <tr key={idx}>
                            <td><strong>{row.school}</strong></td>
                            <td>{row.class}</td>
                            {row.days.map((books, dayIdx) => (
                              <td
                                key={dayIdx}
                                onClick={() => books > 0 && openDetailModal(dayIdx + 1, row.school)}
                                className={books > 0 ? "clickable-cell" : ""}
                                title={books > 0 ? `Click để xem chi tiết ngày ${dayIdx + 1}` : ""}
                              >
                                {books > 0 ? books : "-"}
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
                          const dayTotal = empTable.reduce((sum, row) => sum + row.days[i], 0);
                          return <td key={i}><strong>{dayTotal > 0 ? dayTotal : ""}</strong></td>
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
        </>
      )}

      {/* Bảng tổng chung (nếu không có filter nhân viên) */}
      {Object.keys(employeeSummaryTables).length === 0 && (
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
                      {row.days.map((books, dayIdx) => (
                        <td
                          key={dayIdx}
                          onClick={() => books > 0 && openDetailModal(dayIdx + 1, row.school)}
                          className={books > 0 ? "clickable-cell" : ""}
                          title={books > 0 ? `Click để xem chi tiết ngày ${dayIdx + 1}` : ""}
                        >
                          {books > 0 ? books : "-"}
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
                      const dayTotal = summaryTable.reduce((sum, row) => sum + row.days[i], 0);
                      return <td key={i}><strong>{dayTotal > 0 ? dayTotal : ""}</strong></td>
                    })}
                    <td><strong>{totalBooks}</strong></td>
                    <td><strong>{formatVND(totalMoney)}</strong></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary - Tổng tất cả nhân viên */}
      <div className="summary">
        <div><b>Tổng số sổ (tất cả):</b> {totalBooks}</div>
        <div><b>Tổng tiền (tất cả):</b> {formatVND(totalMoney)}</div>
      </div>

      {/* Modal Chi tiết */}
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
                    <td></td>
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
