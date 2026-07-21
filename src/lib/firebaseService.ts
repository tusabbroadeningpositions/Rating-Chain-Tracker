import { 
  collection, 
  doc, 
  getDoc,
  getDocs, 
  query, 
  where, 
  setDoc, 
  deleteDoc, 
  onSnapshot,
  serverTimestamp,
  writeBatch,
  updateDoc,
  orderBy,
  addDoc
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { ArmyRatingRecord, RatingScheme } from "../types";
import { INITIAL_RECORDS } from "../sampleData";

export const SCHEMES_COL = "schemes";
export const RECORDS_COL = "records";
export const HISTORY_COL = "history";

// --- REQUIRED ERROR HANDLING ENUMS AND INTERFACES ---

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error Detailed Info: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- SECURED SERVICE FUNCTIONS ---

export async function createScheme(userId: string, name: string): Promise<string> {
  const schemeRef = doc(collection(db, SCHEMES_COL));
  const newScheme = {
    id: schemeRef.id,
    name,
    userId,
    isShared: false,
    allowEdit: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  try {
    await setDoc(schemeRef, newScheme);
    return schemeRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${SCHEMES_COL}/${schemeRef.id}`);
  }
}

export async function deleteScheme(userId: string, schemeId: string): Promise<void> {
  const batch = writeBatch(db);
  const qPath = RECORDS_COL;
  
  try {
    // Delete all records in the scheme
    const q = query(
      collection(db, RECORDS_COL), 
      where("userId", "==", userId),
      where("schemeId", "==", schemeId)
    );
    const snapshot = await getDocs(q);
    snapshot.docs.forEach(d => {
      batch.delete(d.ref);
    });
    
    // Delete the scheme itself
    batch.delete(doc(db, SCHEMES_COL, schemeId));
    
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${SCHEMES_COL}/${schemeId}`);
  }
}

export async function renameScheme(schemeId: string, newName: string): Promise<void> {
  const path = `${SCHEMES_COL}/${schemeId}`;
  try {
    await updateDoc(doc(db, SCHEMES_COL, schemeId), {
      name: newName,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleSchemeShare(schemeId: string, isShared: boolean): Promise<void> {
  const path = `${SCHEMES_COL}/${schemeId}`;
  try {
    await updateDoc(doc(db, SCHEMES_COL, schemeId), {
      isShared,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleSchemeEdit(schemeId: string, allowEdit: boolean): Promise<void> {
  const path = `${SCHEMES_COL}/${schemeId}`;
  try {
    await updateDoc(doc(db, SCHEMES_COL, schemeId), {
      allowEdit,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateSchemeDates(
  schemeId: string,
  dates: {
    effectiveAsOf?: string;
    proposedEffectiveDateFuture?: string;
    proposedEffectiveDateAlternate?: string;
  }
): Promise<void> {
  const path = `${SCHEMES_COL}/${schemeId}`;
  try {
    await updateDoc(doc(db, SCHEMES_COL, schemeId), {
      ...dates,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function getScheme(schemeId: string): Promise<RatingScheme | null> {
  const path = `${SCHEMES_COL}/${schemeId}`;
  try {
    const d = await getDoc(doc(db, SCHEMES_COL, schemeId));
    if (!d.exists()) return null;
    return {
      ...d.data(),
      id: d.id,
      createdAt: d.data().createdAt?.toMillis?.() || Date.now(),
      updatedAt: d.data().updatedAt?.toMillis?.() || Date.now()
    } as RatingScheme;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export function subscribeToSchemes(userId: string, onUpdate: (schemes: RatingScheme[]) => void) {
  const q = query(
    collection(db, SCHEMES_COL), 
    where("userId", "==", userId)
  );
  return onSnapshot(q, (snapshot) => {
    const schemes = snapshot.docs.map(d => ({ 
      ...d.data(), 
      id: d.id,
      createdAt: d.data().createdAt?.toMillis?.() || Date.now(),
      updatedAt: d.data().updatedAt?.toMillis?.() || Date.now()
    } as RatingScheme));
    // Sort descending by createdAt
    schemes.sort((a, b) => b.createdAt - a.createdAt);
    onUpdate(schemes);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, SCHEMES_COL);
  });
}

export function subscribeToRecords(
  schemeId: string, 
  onUpdate: (records: ArmyRatingRecord[]) => void, 
  userId?: string,
  onError?: (error: any) => void
) {
  let q;
  if (userId) {
    q = query(
      collection(db, RECORDS_COL), 
      where("userId", "==", userId),
      where("schemeId", "==", schemeId)
    );
  } else {
    q = query(
      collection(db, RECORDS_COL), 
      where("schemeId", "==", schemeId)
    );
  }
  return onSnapshot(q, (snapshot) => {
    const records = snapshot.docs.map(d => d.data() as ArmyRatingRecord);
    onUpdate(records);
  }, (error) => {
    if (onError) {
      onError(error);
    } else {
      handleFirestoreError(error, OperationType.LIST, RECORDS_COL);
    }
  });
}

export async function saveRecord(record: ArmyRatingRecord, userId: string, schemeId: string): Promise<void> {
  const path = `${RECORDS_COL}/${record.id}`;
  try {
    const recordRef = doc(db, RECORDS_COL, record.id);
    const updateData = {
      ...record,
      userId,
      schemeId,
      updatedAt: serverTimestamp()
    };
    
    await setDoc(recordRef, updateData);

    // Save to history sub-collection
    const historyRef = doc(collection(recordRef, HISTORY_COL));
    await setDoc(historyRef, {
      ...updateData,
      historyId: historyRef.id,
      snapshotAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteRecord(recordId: string): Promise<void> {
  const path = `${RECORDS_COL}/${recordId}`;
  try {
    await deleteDoc(doc(db, RECORDS_COL, recordId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function overwriteSchemeRecords(records: ArmyRatingRecord[], userId: string, schemeId: string): Promise<void> {
  const batch = writeBatch(db);
  
  try {
    // 1. Get all current records for this scheme
    const q = query(
      collection(db, RECORDS_COL), 
      where("userId", "==", userId),
      where("schemeId", "==", schemeId)
    );
    const snapshot = await getDocs(q);
    
    // 2. Add delete operations for all existing records
    snapshot.docs.forEach(d => {
      batch.delete(d.ref);
    });
    
    // 3. Add set operations for all new records
    records.forEach(record => {
      const ref = doc(db, RECORDS_COL, record.id);
      batch.set(ref, {
        ...record,
        userId,
        schemeId,
        updatedAt: serverTimestamp()
      });
    });
    
    // 4. Commit atomically
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, RECORDS_COL);
  }
}

export async function batchSaveRecords(records: ArmyRatingRecord[], userId: string, schemeId: string): Promise<void> {
  const batch = writeBatch(db);
  try {
    records.forEach(record => {
      const recordRef = doc(db, RECORDS_COL, record.id);
      const updateData = {
        ...record,
        userId,
        schemeId,
        updatedAt: serverTimestamp()
      };
      
      batch.set(recordRef, updateData);

      // Save to history sub-collection
      const historyRef = doc(collection(recordRef, HISTORY_COL));
      batch.set(historyRef, {
        ...updateData,
        historyId: historyRef.id,
        snapshotAt: serverTimestamp()
      });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, RECORDS_COL);
  }
}

export async function duplicateScheme(userId: string, schemeId: string, originalName: string): Promise<string> {
  const newSchemeRef = doc(collection(db, SCHEMES_COL));
  const newSchemeId = newSchemeRef.id;

  const newScheme = {
    id: newSchemeId,
    name: `${originalName} (Copy)`,
    userId,
    isShared: false,
    allowEdit: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    // 1. Save scheme metadata first so it exists in the database
    await setDoc(newSchemeRef, newScheme);

    // Fetch all existing records for the old scheme
    const q = query(
      collection(db, RECORDS_COL),
      where("userId", "==", userId),
      where("schemeId", "==", schemeId)
    );
    const snapshot = await getDocs(q);

    // Map old record ID to new record ID to prevent collisions
    const idMap: { [oldId: string]: string } = {};
    snapshot.docs.forEach(d => {
      idMap[d.id] = doc(collection(db, RECORDS_COL)).id;
    });

    const batch = writeBatch(db);
    // Create new records with updated IDs and links
    snapshot.docs.forEach(d => {
      const data = d.data() as ArmyRatingRecord;
      const newId = idMap[data.id];
      if (!newId) return;

      const clonedRecord: ArmyRatingRecord = {
        ...data,
        id: newId,
        raterId: idMap[data.raterId] || (data.raterId ? data.raterId : ""),
        seniorRaterId: idMap[data.seniorRaterId] || (data.seniorRaterId ? data.seniorRaterId : ""),
        reviewerId: idMap[data.reviewerId] || (data.reviewerId ? data.reviewerId : "")
      };

      const ref = doc(db, RECORDS_COL, newId);
      batch.set(ref, {
        ...clonedRecord,
        userId,
        schemeId: newSchemeId,
        updatedAt: serverTimestamp()
      });
    });

    await batch.commit();
    return newSchemeId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, SCHEMES_COL);
  }
}

export async function createDefaultScheme(userId: string): Promise<string> {
  const schemeRef = doc(collection(db, SCHEMES_COL));
  const newSchemeId = schemeRef.id;

  const newScheme = {
    id: newSchemeId,
    name: "Blues Rating Scheme",
    userId,
    isShared: false,
    allowEdit: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    // 1. Create the scheme document first so it exists in the database
    await setDoc(schemeRef, newScheme);

    // Map old record ID to new record ID to prevent collisions across multiple users
    const idMap: { [oldId: string]: string } = {};
    INITIAL_RECORDS.forEach(r => {
      idMap[r.id] = doc(collection(db, RECORDS_COL)).id;
    });

    const batch = writeBatch(db);
    INITIAL_RECORDS.forEach(record => {
      const newId = idMap[record.id];
      if (!newId) return;

      const clonedRecord: ArmyRatingRecord = {
        ...record,
        id: newId,
        raterId: idMap[record.raterId] || (record.raterId ? record.raterId : ""),
        seniorRaterId: idMap[record.seniorRaterId] || (record.seniorRaterId ? record.seniorRaterId : ""),
        reviewerId: idMap[record.reviewerId] || (record.reviewerId ? record.reviewerId : "")
      };

      const ref = doc(db, RECORDS_COL, newId);
      batch.set(ref, {
        ...clonedRecord,
        userId,
        schemeId: newSchemeId,
        updatedAt: serverTimestamp()
      });
    });

    await batch.commit();
    return newSchemeId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, SCHEMES_COL);
  }
}

export function subscribeToRecordHistory(
  recordId: string,
  onUpdate: (history: any[]) => void
) {
  const q = query(
    collection(db, RECORDS_COL, recordId, HISTORY_COL),
    orderBy("updatedAt", "desc")
  );
  
  return onSnapshot(q, (snapshot) => {
    const history = snapshot.docs.map(d => ({
      ...d.data(),
      id: d.id,
      parentRecordId: recordId,
      isHistoryEntry: true,
      snapshotAt: d.data().snapshotAt?.toMillis?.() || Date.now()
    }));
    // Sort descending by snapshotAt
    history.sort((a, b) => b.snapshotAt - (a as any).snapshotAt);
    onUpdate(history);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, `${RECORDS_COL}/${recordId}/${HISTORY_COL}`);
  });
}

export async function deleteHistoryRecord(recordId: string, historyId: string): Promise<void> {
  if (!recordId || !historyId) throw new Error("Missing recordId or historyId");
  const path = `${RECORDS_COL}/${recordId}/${HISTORY_COL}/${historyId}`;
  try {
    await deleteDoc(doc(db, RECORDS_COL, recordId, HISTORY_COL, historyId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    throw error;
  }
}

export async function updateHistoryRecord(recordId: string, historyId: string, data: Partial<ArmyRatingRecord>): Promise<void> {
  const path = `${RECORDS_COL}/${recordId}/${HISTORY_COL}/${historyId}`;
  try {
    const { id, parentRecordId, isHistoryEntry, updatedAt, snapshotAt, historyId: hId, ...updateData } = data as any;
    await updateDoc(doc(db, RECORDS_COL, recordId, HISTORY_COL, historyId), {
      ...updateData,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

export async function copyVersion(
  userId: string,
  schemeId: string,
  fromVersion: "current" | "future" | "alternate",
  toVersion: "current" | "future" | "alternate"
): Promise<void> {
  const batch = writeBatch(db);

  try {
    const q = query(
      collection(db, RECORDS_COL),
      where("userId", "==", userId),
      where("schemeId", "==", schemeId)
    );
    const snapshot = await getDocs(q);

    const allRecords = snapshot.docs.map(d => d.data() as ArmyRatingRecord);
    const sourceRecords = allRecords.filter(r => (r.version || "current") === fromVersion);
    const targetDocsToDelete = snapshot.docs.filter(docSnap => {
      const r = docSnap.data() as ArmyRatingRecord;
      return (r.version || "current") === toVersion;
    });

    targetDocsToDelete.forEach(d => {
      batch.delete(d.ref);
    });

    const idMap: { [oldId: string]: string } = {};
    sourceRecords.forEach(r => {
      idMap[r.id] = doc(collection(db, RECORDS_COL)).id;
    });

    sourceRecords.forEach(record => {
      const newId = idMap[record.id];
      if (!newId) return;

      const clonedRecord: ArmyRatingRecord = {
        ...record,
        id: newId,
        raterId: idMap[record.raterId] || (record.raterId ? record.raterId : ""),
        seniorRaterId: idMap[record.seniorRaterId] || (record.seniorRaterId ? record.seniorRaterId : ""),
        reviewerId: idMap[record.reviewerId] || (record.reviewerId ? record.reviewerId : ""),
        version: toVersion
      };

      const ref = doc(db, RECORDS_COL, newId);
      batch.set(ref, {
        ...clonedRecord,
        userId,
        schemeId,
        updatedAt: serverTimestamp()
      });

      if (toVersion === "current") {
        const historyRef = doc(collection(ref, HISTORY_COL));
        batch.set(historyRef, {
          ...clonedRecord,
          userId,
          schemeId,
          historyId: historyRef.id,
          snapshotAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          isCopyAction: true
        });
      }
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, RECORDS_COL);
  }
}

export async function restoreRecordHistory(recordId: string, historyData: any): Promise<void> {
  const { historyId, snapshotAt, id: histId, parentRecordId, isHistoryEntry, updatedAt, ...rest } = historyData;
  const recordRef = doc(db, RECORDS_COL, recordId);
  try {
    // Save current as history before restoring
    const currentSnap = await getDoc(recordRef);
    if (currentSnap.exists()) {
      const historyColRef = collection(recordRef, HISTORY_COL);
      await addDoc(historyColRef, {
        ...currentSnap.data(),
        snapshotAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    // Restore
    await setDoc(recordRef, {
      ...rest,
      id: recordId,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${RECORDS_COL}/${recordId}`);
    throw error;
  }
}
