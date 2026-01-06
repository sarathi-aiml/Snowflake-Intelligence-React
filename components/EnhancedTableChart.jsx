'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Download, BarChart3, Table as TableIcon, ChevronDown, ArrowUp, ArrowDown, Image, Maximize2 } from 'lucide-react';
import { Tooltip, Select } from 'antd';
import ChartComponent from '@/components/ChartComponent';

// Export the helper functions so they can be used by the Explore panel
export { extractTableFromChartSpec, hasValidTableData, hasValidChartSpec };

/**
 * Extract table data from Chart.js chart spec
 * Converts Chart.js format to headers/rows format
 */
function extractTableFromChartSpec(chartSpec) {
  if (!chartSpec) return null;

  // Chart.js format - convert to table
  if (chartSpec.datasets?.[0]?.data && Array.isArray(chartSpec.datasets[0].data)) {
    const labels = chartSpec.labels || [];
    const datasets = chartSpec.datasets || [];

    if (labels.length > 0 && datasets.length > 0) {
      const headers = ['Label', ...datasets.map(d => d.label || 'Value')];
      const rows = labels.map((label, idx) => [
        label,
        ...datasets.map(d => d.data?.[idx] ?? '')
      ]);
      return { headers, rows, title: chartSpec.title };
    }
    return null;
  }

  // Also handle Chart.js data structure (data.labels, data.datasets)
  if (chartSpec.data?.labels && chartSpec.data?.datasets) {
    const labels = chartSpec.data.labels || [];
    const datasets = chartSpec.data.datasets || [];

    if (labels.length > 0 && datasets.length > 0) {
      const headers = ['Label', ...datasets.map(d => d.label || 'Value')];
      const rows = labels.map((label, idx) => [
        label,
        ...datasets.map(d => d.data?.[idx] ?? '')
      ]);
      return { headers, rows, title: chartSpec.title || chartSpec.data.title };
    }
  }

  return null;
}

/**
 * Check if we have valid table data
 */
function hasValidTableData(tableData) {
  if (!tableData) return false;
  // Check if we have headers or rows (can have headers even if rows are empty)
  const hasHeaders = Array.isArray(tableData.headers) && tableData.headers.length > 0;
  const hasRows = Array.isArray(tableData.rows) && tableData.rows.length > 0;
  // Valid if we have headers (rows can be empty initially)
  return hasHeaders || hasRows;
}

/**
 * Check if we have valid chart spec (supports both Chart.js and Vega-Lite formats)
 */
function hasValidChartSpec(chartSpec) {
  if (!chartSpec) return false;

  // Chart.js spec
  if (chartSpec.labels && chartSpec.datasets) return true;
  // Chart.js data structure
  if (chartSpec.data?.labels && chartSpec.data?.datasets) return true;

  // Vega-Lite format (has mark, encoding, and data properties)
  if (chartSpec.mark && chartSpec.encoding && chartSpec.data) return true;

  return false;
}

export default function EnhancedTableChart({ tableData: propTableData, chartSpec: propChartSpec, title, onExplore }) {
  // Check what data we have initially
  const initialHasTable = hasValidTableData(propTableData);
  const initialHasChart = hasValidChartSpec(propChartSpec);

  // Determine initial view mode: prefer chart if we have chart spec but no table, otherwise table
  const getInitialViewMode = () => {
    // If we have chart but no table, default to chart view
    if (initialHasChart && !initialHasTable) return 'chart';
    // Otherwise default to table view
    return 'table';
  };

  const [viewMode, setViewMode] = useState(getInitialViewMode()); // 'table' or 'chart'
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' or 'desc'
  const chartRef = useRef(null);

  // Derive table data from chart spec if table not available
  const derivedTableFromChart = useMemo(() => {
    if (!hasValidTableData(propTableData) && hasValidChartSpec(propChartSpec)) {
      const extracted = extractTableFromChartSpec(propChartSpec);
      console.log('[EnhancedTableChart] Derived table from chart:', extracted);
      return extracted;
    }
    return null;
  }, [propTableData, propChartSpec]);

  // Use prop table data or derived table data
  const tableData = hasValidTableData(propTableData) ? propTableData : derivedTableFromChart;

  // For chart: use prop chartSpec, or derive from tableData
  const chartSpec = propChartSpec;

  // Re-check what data we have (after deriving table from chart if needed)
  const finalHasTable = hasValidTableData(tableData);
  const finalHasChart = hasValidChartSpec(chartSpec) || hasValidTableData(tableData); // Can use table for chart

  // Use provided title or derived title
  const displayTitle = title || tableData?.title || propChartSpec?.title || null;

  // Handle explore button click - use useCallback to ensure proper closure
  const handleExplore = useCallback(() => {
    if (onExplore) {
      onExplore(propChartSpec, tableData, displayTitle);
    }
  }, [onExplore, propChartSpec, tableData, displayTitle]);

  // Debug logging
  console.log('[EnhancedTableChart] Data state:', {
    propTableData: propTableData ? { headers: propTableData.headers?.length, rows: propTableData.rows?.length } : null,
    propChartSpec: propChartSpec ? {
      hasMark: !!propChartSpec.mark,
      hasEncoding: !!propChartSpec.encoding,
      hasData: !!propChartSpec.data,
      keys: Object.keys(propChartSpec || {})
    } : null,
    derivedTable: derivedTableFromChart ? { headers: derivedTableFromChart.headers?.length, rows: derivedTableFromChart.rows?.length } : null,
    finalTableData: tableData ? { headers: tableData.headers?.length, rows: tableData.rows?.length } : null,
    hasTable: finalHasTable,
    hasChart: finalHasChart,
    viewMode,
    title
  });

  // Sort table data
  const sortedRows = useMemo(() => {
    if (!tableData?.rows || !sortColumn) return tableData?.rows || [];

    const columnIndex = tableData.headers?.indexOf(sortColumn);
    if (columnIndex === -1) return tableData.rows;

    return [...tableData.rows].sort((a, b) => {
      const aVal = a[columnIndex];
      const bVal = b[columnIndex];

      // Try to parse as numbers (handle formatted numbers with commas)
      const aNum = parseFloat(String(aVal).replace(/,/g, ''));
      const bNum = parseFloat(String(bVal).replace(/,/g, ''));

      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
      }

      // String comparison
      const aStr = String(aVal || '').toLowerCase();
      const bStr = String(bVal || '').toLowerCase();

      if (sortDirection === 'asc') {
        return aStr.localeCompare(bStr);
      } else {
        return bStr.localeCompare(aStr);
      }
    });
  }, [tableData, sortColumn, sortDirection]);

  // Handle column sort
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Download as CSV
  const downloadCSV = () => {
    if (!tableData?.headers || !tableData?.rows) return;

    const headers = tableData.headers.join(',');
    const rows = sortedRows.map(row =>
      row.map(cell => {
        const cellStr = String(cell || '');
        // Escape quotes and wrap in quotes if contains comma or quote
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(',')
    ).join('\n');

    const csvContent = `${headers}\n${rows}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `${(displayTitle || 'data').replace(/[^a-z0-9]/gi, '_')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copy chart as image to clipboard
  const copyChartAsImage = async () => {
    if (!chartRef.current) return;

    try {
      // Find the canvas element within the chart
      const canvas = chartRef.current.querySelector('canvas');
      if (!canvas) {
        console.error('No canvas found in chart');
        return;
      }

      // Convert canvas to blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          console.error('Failed to create blob from canvas');
          return;
        }

        try {
          // Copy to clipboard
          await navigator.clipboard.write([
            new ClipboardItem({
              'image/png': blob
            })
          ]);
          console.log('Chart copied to clipboard');
        } catch (err) {
          console.error('Failed to copy chart to clipboard:', err);
          // Fallback: download the image
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${(displayTitle || 'chart').replace(/[^a-z0-9]/gi, '_')}.png`;
          link.click();
          URL.revokeObjectURL(url);
        }
      }, 'image/png');
    } catch (err) {
      console.error('Error copying chart:', err);
    }
  };

  // If no data at all, don't render anything
  if (!finalHasTable && !finalHasChart) {
    console.log('[EnhancedTableChart] No valid data, not rendering');
    return null;
  }

  return (
    <div className="enhanced-table-chart-container">
      <div className="enhanced-table-header">
        {displayTitle && <h3 className="enhanced-table-title">{displayTitle}</h3>}
        <div className="enhanced-table-actions">
          {finalHasTable && (
            <Tooltip title="Download as CSV">
              <button
                className="enhanced-action-btn download-btn icon-only"
                onClick={downloadCSV}
              >
                <Download size={16} />
              </button>
            </Tooltip>
          )}

          {/* Explore Button */}
          {onExplore && (finalHasTable || finalHasChart) && (
            <Tooltip title="Explore in full view">
              <button
                className="enhanced-action-btn explore-btn"
                onClick={handleExplore}
              >
                <Maximize2 size={16} />
                <span>Explore</span>
              </button>
            </Tooltip>
          )}

          {viewMode === 'chart' && finalHasChart && (
            <Tooltip title="Copy chart as image">
              <button
                className="enhanced-action-btn copy-chart-btn icon-only"
                onClick={copyChartAsImage}
              >
                <Image size={16} />
              </button>
            </Tooltip>
          )}

          {/* Show toggle buttons - only show table button if table data exists */}
          {(finalHasTable || finalHasChart) && (
            <>
              {finalHasChart && (
                <button
                  className={`enhanced-view-btn ${viewMode === 'chart' ? 'active' : ''}`}
                  onClick={() => setViewMode('chart')}
                  title="Chart view"
                >
                  <BarChart3 size={16} />
                  <span>Chart</span>
                </button>
              )}
              {finalHasTable && (
                <button
                  className={`enhanced-view-btn ${viewMode === 'table' ? 'active' : ''}`}
                  onClick={() => setViewMode('table')}
                  title="Table view"
                >
                  <TableIcon size={16} />
                  <span>Table</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="enhanced-table-content">
        {/* TABLE VIEW */}
        {viewMode === 'table' && finalHasTable && (
          <div className="enhanced-table-wrapper">
            <table className="enhanced-table">
              <thead>
                <tr>
                  {tableData.headers.map((header, idx) => (
                    <th
                      key={idx}
                      className={sortColumn === header ? 'sorted' : ''}
                      onClick={() => handleSort(header)}
                    >
                      <div className="th-content">
                        <span>{header}</span>
                        {sortColumn === header && (
                          <span className="sort-icon">
                            {sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                          </span>
                        )}
                        {sortColumn !== header && (
                          <span className="sort-icon-placeholder">
                            <ArrowUp size={14} />
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    {row.map((cell, cellIdx) => (
                      <td key={cellIdx}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {sortedRows.length > 10 && (
              <div className="table-scroll-indicator">
                <ChevronDown size={16} />
              </div>
            )}
          </div>
        )}

        {/* CHART VIEW */}
        {viewMode === 'chart' && finalHasChart && (
          <div className="enhanced-chart-wrapper" ref={chartRef}>
            <ChartComponent
              chartSpec={chartSpec}
              tableData={tableData}
            />
          </div>
        )}
      </div>
    </div>
  );
}
