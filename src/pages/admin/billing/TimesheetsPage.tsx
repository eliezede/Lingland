import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';

export const AdminTimesheets = () => {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get('jobId');
  const target = jobId
    ? `/admin/operations/timesheets?jobId=${encodeURIComponent(jobId)}`
    : '/admin/operations/timesheets';

  return <Navigate to={target} replace />;
};
