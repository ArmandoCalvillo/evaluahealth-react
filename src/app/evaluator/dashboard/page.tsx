"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function EvaluatorDashboardRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/evaluator/evaluate"); }, [router]);
  return null;
}
