'use client';

import React from 'react';
import './PageLoader.css';

const PageLoader = ({ text = 'Loading...' }) => {
    return (
        <div className="page-loader">
            <div className="page-loader-container">
                <div className="spinner-wrapper">
                    <div className="page-loader-ring"></div>
                    <div className="page-loader-ring"></div>
                    <div className="page-loader-ring"></div>
                    <div className="page-loader-ring"></div>
                </div>
                <div className="page-loader-text">{text}</div>
            </div>
        </div>
    );
};

export default PageLoader;

