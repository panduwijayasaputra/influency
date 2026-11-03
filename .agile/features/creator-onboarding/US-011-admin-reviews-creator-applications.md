# US-011: Admin Reviews Creator Applications

**Status:** ready_for_uat
**Priority:** high
**Feature:** creator-onboarding

## Description

As an admin, I want to approve or reject creator applications, so that only vetted creators can sell content on Influency.

## Acceptance Criteria

- [ ] Admins see a list of pending applications with the applicant details and requested slug
- [ ] Approving activates the creator profile and gives the user Studio access; rejecting records a reason
- [ ] Each decision records the reviewing admin and the timestamp
- [ ] Non-admins cannot list, approve or reject applications

## Tasks

### TASK-032: Review history table, shared admin contracts, demo pending application
**Status:** done

### TASK-033: Admin review API (`GET /admin/creators/applications`, approve, reject) + rejection reason for applicants
**Status:** done

### TASK-034: `/admin/creators` review page + rejection reason on `/become-creator`
**Status:** done
