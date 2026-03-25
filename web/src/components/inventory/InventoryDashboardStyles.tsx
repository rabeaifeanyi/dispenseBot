'use client';

export default function InventoryDashboardStyles() {
  return (
    <style jsx>{`
      :global(.low-stock-row) {
        background-color: #fffbe6;
      }
      :global(.critical-stock-row) {
        background-color: #fff1f0;
      }
      :global(.admin-inventory-table) {
        font-size: 12px;
      }
      :global(.admin-inventory-table .ant-table),
      :global(.admin-inventory-table .ant-table-thead > tr > th),
      :global(.admin-inventory-table .ant-table-tbody > tr > td) {
        font-size: 12px;
      }
      :global(.admin-inventory-table .ant-table-thead > tr > th) {
        font-weight: 600;
        padding: 6px 8px;
        vertical-align: bottom;
      }
      :global(
          .admin-inventory-table .ant-table-thead > tr > th.ant-table-cell
        ) {
        white-space: nowrap;
        word-break: normal !important;
        overflow-wrap: normal;
        hyphens: none;
      }
      :global(.admin-inventory-table .inventory-table-th-label) {
        font-size: 10.5px;
        line-height: 1.25;
        letter-spacing: -0.01em;
        white-space: nowrap;
      }
      :global(.admin-inventory-table .ant-table-tbody > tr > td) {
        padding: 10px 8px;
        vertical-align: middle;
        min-height: 56px;
        box-sizing: border-box;
      }
      :global(.admin-inventory-table .ant-table-tbody > tr > td) > * {
        min-height: 32px;
      }
      :global(.admin-inventory-table .admin-table-actions),
      :global(.admin-inventory-table .admin-table-actions-edit) {
        flex-wrap: nowrap;
        justify-content: flex-start;
      }
      :global(.admin-inventory-table .admin-table-action-btn) {
        font-size: 11px;
        flex-shrink: 0;
      }
      :global(.admin-inventory-table .admin-table-magazine-btn) {
        font-size: 10px;
      }
      :global(.admin-inventory-table th.admin-table-actions-col),
      :global(.admin-inventory-table td.admin-table-actions-col) {
        width: 208px;
        max-width: 208px;
        text-align: right;
        vertical-align: middle;
      }
      :global(.admin-inventory-table td.admin-table-actions-col .admin-table-actions),
      :global(
          .admin-inventory-table td.admin-table-actions-col .admin-table-actions-edit
        ) {
        justify-content: flex-end;
        width: 100%;
      }
    `}</style>
  );
}
