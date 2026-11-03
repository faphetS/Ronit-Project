import type { CustomerCounts, CustomersService, Page, PassportReveal } from "../services";
import type { Customer, CustomerMessage, PassportAccessEntry, PassportIntake } from "../types";
import { dashboardApi, queryString, segment } from "./api";
import type { ApiClient } from "./client";

/** Customers, their notes and passports. Passport numbers come masked; revealing one is logged. */
export function createHttpCustomersService(api: ApiClient): CustomersService {
  const http = dashboardApi(api);
  return {
    list: (query = {}) =>
      http.get<Page<Customer>>(
        `/customers${queryString({ filter: query.filter, search: query.search?.trim(), page: query.page, pageSize: query.pageSize })}`,
      ),
    get: (id) => http.get<Customer>(`/customers/${segment(id)}`, "Customer", id),
    intakes: () => http.get<PassportIntake[]>("/customers/intakes"),
    counts: () => http.get<CustomerCounts>("/customers/counts"),
    messages: (id) => http.get<CustomerMessage[]>(`/customers/${segment(id)}/messages`, "Customer", id),
    accessLog: (id) => http.get<PassportAccessEntry[]>(`/customers/${segment(id)}/access-log`, "Customer", id),
    addNote: (id, text) => http.post<Customer>(`/customers/${segment(id)}/notes`, { text }, "Customer", id),
    logPassportView: (id, part) => http.post<PassportReveal>(`/customers/${segment(id)}/passport-views`, { part }, "Passport", id),
  };
}
