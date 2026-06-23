package model

import (
	"sync"
	"testing"
)

func TestPerformTxLargeInsertFailureRollsBack(t *testing.T) {
	ops := make([]*Operation, 32)
	for i := range ops {
		ops[i] = &Operation{
			Action:   "insert",
			ID:       "missing",
			ParentID: "missing",
			Data:     "",
		}
	}

	tx := &Transaction{DoOperations: ops, m: &sync.Mutex{}}
	txErr := performTx(tx)
	if txErr == nil {
		t.Fatal("large insert failure must be returned")
	}
	if txErr.code != TxErrCodeBlockNotFound {
		t.Fatalf("tx error code = %d, want %d", txErr.code, TxErrCodeBlockNotFound)
	}
	if tx.state.Load() != 3 {
		t.Fatalf("failed large insert transaction state = %d, want rollback state 3", tx.state.Load())
	}
}

func TestPerformTxLargeDeleteFailureRollsBack(t *testing.T) {
	ops := make([]*Operation, 32)
	for i := range ops {
		ops[i] = &Operation{
			Action: "delete",
			ID:     "missing",
		}
	}

	tx := &Transaction{DoOperations: ops, m: &sync.Mutex{}}
	txErr := performTx(tx)
	if txErr == nil {
		t.Fatal("large delete failure must be returned")
	}
	if txErr.code != TxErrCodeBlockNotFound {
		t.Fatalf("tx error code = %d, want %d", txErr.code, TxErrCodeBlockNotFound)
	}
	if tx.state.Load() != 3 {
		t.Fatalf("failed large delete transaction state = %d, want rollback state 3", tx.state.Load())
	}
}
