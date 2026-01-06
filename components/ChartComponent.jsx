'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Bar, Line, Pie } from 'react-chartjs-2';
import { Select } from 'antd';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Default colors - vibrant palette
const defaultColors = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  '#6366f1', '#14b8a6', '#f97316', '#dc2626'
];

// Background colors with transparency for bar/line charts
const defaultBgColors = [
  'rgba(59, 130, 246, 0.7)', 'rgba(16, 185, 129, 0.7)', 'rgba(245, 158, 11, 0.7)', 'rgba(239, 68, 68, 0.7)',
  'rgba(139, 92, 246, 0.7)', 'rgba(236, 72, 153, 0.7)', 'rgba(6, 182, 212, 0.7)', 'rgba(132, 204, 22, 0.7)',
  'rgba(99, 102, 241, 0.7)', 'rgba(20, 184, 166, 0.7)', 'rgba(249, 115, 22, 0.7)', 'rgba(220, 38, 38, 0.7)'
];

function getColorForIndex(index, isBorder = false, isBackground = false) {
  if (isBackground) {
    return defaultBgColors[index % defaultBgColors.length];
  }
  return defaultColors[index % defaultColors.length];
}

/**
 * Chart.js Chart Component
 */
function ChartJSChart({ chartSpec, tableData, chartType }) {
  const [activeTab, setActiveTab] = useState(chartType || 'bar');

  // Update activeTab when chartType prop changes
  useEffect(() => {
    if (chartType) {
      setActiveTab(chartType);
    }
  }, [chartType]);

  // Convert Vega-Lite spec to Chart.js format
  const convertVegaLiteToChartJS = (vegaSpec) => {
    console.log('[ChartComponent] Converting Vega-Lite spec:', {
      hasMark: !!vegaSpec?.mark,
      hasEncoding: !!vegaSpec?.encoding,
      hasData: !!vegaSpec?.data,
      dataValuesCount: vegaSpec?.data?.values?.length || 0,
      hasTransform: !!(vegaSpec?.transform && vegaSpec.transform.length > 0)
    });

    if (!vegaSpec || !vegaSpec.data || !vegaSpec.encoding) {
      console.log('[ChartComponent] Missing required Vega-Lite properties:', {
        hasData: !!vegaSpec?.data,
        hasEncoding: !!vegaSpec?.encoding
      });
      return null;
    }

    try {
      let data = vegaSpec.data?.values || [];
      if (!Array.isArray(data) || data.length === 0) {
        console.log('[ChartComponent] No data values found');
        return null;
      }

      console.log('[ChartComponent] Initial data count:', data.length);

      // Apply transforms if present (e.g., filtering, sorting, window operations)
      if (vegaSpec.transform && Array.isArray(vegaSpec.transform)) {
        // First pass: apply sorting from window transforms
        for (const transform of vegaSpec.transform) {
          if (transform.window && transform.sort) {
            const sortField = transform.sort?.[0]?.field;
            const sortOrder = transform.sort?.[0]?.order || 'descending';

            if (sortField) {
              // Sort data by the specified field
              data = [...data].sort((a, b) => {
                const aVal = a[sortField];
                const bVal = b[sortField];
                if (sortOrder === 'descending') {
                  return (bVal || 0) - (aVal || 0);
                }
                return (aVal || 0) - (bVal || 0);
              });
            }
          }
        }

        // Second pass: apply filters (after sorting)
        for (const transform of vegaSpec.transform) {
          if (transform.filter && typeof transform.filter === 'string') {
            // Filter to top N based on rank (e.g., "datum.rank <= 15")
            const rankMatch = transform.filter.match(/rank\s*<=\s*(\d+)/);
            if (rankMatch) {
              const topN = parseInt(rankMatch[1], 10);
              data = data.slice(0, topN);
            } else {
              // Try other filter patterns
              const topMatch = transform.filter.match(/<=?\s*(\d+)/);
              if (topMatch) {
                const topN = parseInt(topMatch[1], 10);
                data = data.slice(0, topN);
              }
            }
          }
        }
      }

      // Extract field names from encoding and determine which is nominal (labels) vs quantitative (values)
      const xEncoding = vegaSpec.encoding.x;
      const yEncoding = vegaSpec.encoding.y;

      // Determine which field is for labels (nominal/ordinal) and which is for values (quantitative)
      let labelField = null;
      let valueField = null;
      let labelFieldTitle = '';
      let valueFieldTitle = '';

      // Check x encoding
      if (xEncoding?.field) {
        const xType = xEncoding.type || '';
        if (xType === 'nominal' || xType === 'ordinal') {
          labelField = xEncoding.field;
          labelFieldTitle = xEncoding.title || labelField;
        } else if (xType === 'quantitative') {
          valueField = xEncoding.field;
          valueFieldTitle = xEncoding.title || valueField;
        }
      }

      // Check y encoding
      if (yEncoding?.field) {
        const yType = yEncoding.type || '';
        if (yType === 'nominal' || yType === 'ordinal') {
          labelField = yEncoding.field;
          labelFieldTitle = yEncoding.title || labelField;
        } else if (yType === 'quantitative') {
          valueField = yEncoding.field;
          valueFieldTitle = yEncoding.title || valueField;
        }
      }

      // Fallback: if types weren't specified, try to infer from field names or use defaults
      if (!labelField || !valueField) {
        // If we have one but not the other, try to infer
        if (labelField && !valueField) {
          // Find the other field that's not the label field
          const firstRow = data[0];
          if (firstRow && typeof firstRow === 'object') {
            const keys = Object.keys(firstRow);
            const otherKey = keys.find(k => k !== labelField);
            if (otherKey) {
              valueField = otherKey;
              valueFieldTitle = otherKey;
            }
          }
        } else if (valueField && !labelField) {
          // Find the other field that's not the value field
          const firstRow = data[0];
          if (firstRow && typeof firstRow === 'object') {
            const keys = Object.keys(firstRow);
            const otherKey = keys.find(k => k !== valueField);
            if (otherKey) {
              labelField = otherKey;
              labelFieldTitle = otherKey;
            }
          }
        } else {
          // Neither was determined, try to infer from data
          const firstRow = data[0];
          if (firstRow && typeof firstRow === 'object') {
            const keys = Object.keys(firstRow);
            if (keys.length >= 2) {
              // Heuristic: assume first key is label, second is value
              labelField = keys[0];
              valueField = keys[1];
              labelFieldTitle = keys[0];
              valueFieldTitle = keys[1];
            }
          }
        }
      }

      if (!labelField || !valueField) {
        console.log('[ChartComponent] Could not determine label and value fields', {
          labelField,
          valueField,
          xEncoding,
          yEncoding
        });
        return null;
      }

      console.log('[ChartComponent] Field mapping:', {
        labelField,
        valueField,
        labelFieldTitle,
        valueFieldTitle
      });

      // Extract labels and values from data
      const labels = data.map(row => String(row[labelField] || ''));
      const values = data.map(row => {
        const val = row[valueField];
        return typeof val === 'number' ? val : parseFloat(val) || 0;
      });

      // Determine chart type from mark
      const chartType = vegaSpec.mark || 'bar';

      console.log('[ChartComponent] Converted Vega-Lite to Chart.js:', {
        labelsCount: labels.length,
        valuesCount: values.length,
        labelField,
        valueField,
        sampleLabels: labels.slice(0, 3),
        sampleValues: values.slice(0, 3),
        chartType
      });

      return {
        labels,
        datasets: [{
          label: valueFieldTitle || 'Value',
          data: values,
          backgroundColor: defaultBgColors,
          borderColor: defaultColors,
          borderWidth: 1
        }]
      };
    } catch (error) {
      console.error('[ChartComponent] Error converting Vega-Lite spec:', error);
      return null;
    }
  };

  // Prepare chart data from chartSpec or tableData
  const chartData = useMemo(() => {
    let labels = [];
    let datasets = [];

    // If we have chartSpec with data structure
    if (chartSpec) {
      // Check if it's a Vega-Lite spec (has mark, encoding, data)
      if (chartSpec.mark && chartSpec.encoding && chartSpec.data) {
        const converted = convertVegaLiteToChartJS(chartSpec);
        if (converted) {
          labels = converted.labels;
          datasets = converted.datasets;
        }
      }
      // Check if chartSpec has direct data structure
      else if (chartSpec.data && chartSpec.data.labels) {
        labels = chartSpec.data.labels || [];
        datasets = chartSpec.data.datasets || [];
      }
      // Check if chartSpec itself is the data structure
      else if (chartSpec.labels || chartSpec.datasets) {
        labels = chartSpec.labels || [];
        datasets = chartSpec.datasets || [];
      }
      // Check if chartSpec has a different structure (e.g., from data_to_chart tool)
      else if (Array.isArray(chartSpec)) {
        // If it's an array, try to extract data
        labels = chartSpec.map((item, idx) => item.label || item.name || `Item ${idx + 1}`);
        datasets = [{
          label: 'Data',
          data: chartSpec.map(item => typeof item.value === 'number' ? item.value : parseFloat(item.value) || 0),
          backgroundColor: defaultColors,
          borderColor: '#1e40af',
          borderWidth: 1
        }];
      }
    }

    // If we have tableData, convert it to chart format
    if ((!labels.length || !datasets.length) && tableData?.headers && tableData?.rows && tableData.rows.length > 0) {
      // Use first column as labels, remaining columns as datasets
      labels = tableData.rows.map(row => String(row[0] || ''));

      // Create datasets from remaining columns
      if (tableData.headers.length > 1) {
        datasets = tableData.headers.slice(1).map((header, colIndex) => {
          const data = tableData.rows.map(row => {
            const value = row[colIndex + 1];
            if (typeof value === 'number') return value;
            const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
            return isNaN(parsed) ? 0 : parsed;
          });

          return {
            label: header,
            data: data,
            backgroundColor: activeTab === 'pie' ? defaultColors : [getColorForIndex(colIndex)],
            borderColor: getColorForIndex(colIndex, true),
            borderWidth: 1
          };
        });
      } else {
        // If only one column, use it as values
        datasets = [{
          label: tableData.headers[0] || 'Values',
          data: tableData.rows.map(row => {
            const value = row[0];
            if (typeof value === 'number') return value;
            const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
            return isNaN(parsed) ? 0 : parsed;
          }),
          backgroundColor: activeTab === 'pie' ? defaultColors : [defaultColors[0]],
          borderColor: '#1e40af',
          borderWidth: 1
        }];
        labels = tableData.rows.map((_, idx) => `Item ${idx + 1}`);
      }
    }

    // Don't create fallback data - return empty arrays if no data
    // The component should handle empty data by not rendering
    return { labels, datasets };
  }, [chartSpec, tableData, activeTab]);

  // Prepare chart data object
  const data = {
    labels: chartData.labels,
    datasets: chartData.datasets.map((dataset, index) => {
      const baseConfig = {
        ...dataset,
        borderWidth: activeTab === 'pie' ? 2 : 2,
      };

      if (activeTab === 'pie') {
        return {
          ...baseConfig,
          backgroundColor: defaultColors,
          borderColor: '#ffffff',
          hoverOffset: 8,
        };
      } else if (activeTab === 'line') {
        return {
          ...baseConfig,
          backgroundColor: 'transparent',
          borderColor: getColorForIndex(index),
          borderWidth: 3,
          pointBackgroundColor: getColorForIndex(index),
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          tension: 0.3,
          fill: false,
        };
      } else {
        // Bar chart
        return {
          ...baseConfig,
          backgroundColor: getColorForIndex(index, false, true),
          borderColor: getColorForIndex(index),
          borderRadius: 4,
          borderSkipped: false,
        };
      }
    })
  };

  // Chart options
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: activeTab === 'pie' ? 'right' : 'top',
        display: chartData.datasets.length > 0,
        labels: {
          padding: 20,
          usePointStyle: true,
          font: {
            size: 12,
            family: "'Inter', sans-serif"
          }
        }
      },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(17, 24, 39, 0.9)',
        titleFont: { size: 13, weight: 'bold' },
        bodyFont: { size: 12 },
        padding: 12,
        cornerRadius: 8,
        displayColors: true,
      }
    },
    scales: activeTab !== 'pie' ? {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.06)',
          drawBorder: false,
        },
        ticks: {
          font: { size: 11 },
          padding: 8,
        }
      },
      x: {
        grid: {
          display: false,
        },
        ticks: {
          font: { size: 11 },
          padding: 8,
        }
      }
    } : undefined
  };

  // Don't render if no data
  if (!chartData.labels.length || !chartData.datasets.length) {
    return null;
  }

  // Render chart based on active tab
  const renderChart = () => {
    switch (activeTab) {
      case 'pie':
        return <Pie data={data} options={options} />;
      case 'line':
        return <Line data={data} options={options} />;
      case 'bar':
      default:
        return <Bar data={data} options={options} />;
    }
  };

  return (
    <div className="chart-container-with-tabs">
      {/* Chart Type Select - Only show if chartType prop is not provided (for EnhancedTableChart) */}
      {!chartType && (
        <div className="chart-type-select-wrapper">
          <Select
            value={activeTab}
            onChange={setActiveTab}
            style={{ width: 150 }}
            options={[
              { label: 'Bar Chart', value: 'bar' },
              { label: 'Pie Chart', value: 'pie' },
              { label: 'Line Chart', value: 'line' }
            ]}
          />
        </div>
      )}

      {/* Chart */}
      <div className="chart-content">
        {renderChart()}
      </div>
    </div>
  );
}

/**
 * Main Chart Component - Uses Chart.js only
 * @param {Object} chartSpec - Chart specification (Chart.js format)
 * @param {Object} tableData - Table data with headers and rows
 * @param {string} chartType - Optional chart type override ('bar', 'line', 'pie')
 */
export default function ChartComponent({ chartSpec, tableData, chartType }) {
  console.log('[ChartComponent] Received:', {
    chartSpec: chartSpec ? (chartSpec.labels ? 'Chart.js with labels' : (chartSpec.data ? 'Chart.js with data' : 'Other format')) : null,
    chartSpecKeys: chartSpec ? Object.keys(chartSpec) : null,
    tableData: tableData ? { headers: tableData.headers?.length, rows: tableData.rows?.length } : null,
    chartType
  });

  // Check if we have any valid data
  const hasChartData = chartSpec && (
    (chartSpec.labels && Array.isArray(chartSpec.labels) && chartSpec.labels.length > 0) ||
    (chartSpec.datasets && Array.isArray(chartSpec.datasets) && chartSpec.datasets.length > 0) ||
    (chartSpec.data?.labels && Array.isArray(chartSpec.data.labels) && chartSpec.data.labels.length > 0) ||
    (chartSpec.data?.datasets && Array.isArray(chartSpec.data.datasets) && chartSpec.data.datasets.length > 0) ||
    (chartSpec.mark && chartSpec.encoding && chartSpec.data) // Vega-Lite format
  );

  const hasTableData = tableData && tableData.headers && Array.isArray(tableData.headers) && tableData.headers.length > 0 &&
    tableData.rows && Array.isArray(tableData.rows) && tableData.rows.length > 0;

  // Don't render if no data available
  if (!hasChartData && !hasTableData) {
    return null;
  }

  return <ChartJSChart chartSpec={chartSpec} tableData={tableData} chartType={chartType} />;
}
