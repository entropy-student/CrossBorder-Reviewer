"use client"

import React from "react"

import AccountInfo from "../account-info"
import { HttpTypes } from "@medusajs/types"
// import { updateCustomer } from "@lib/data/customer"

type MyInformationProps = {
  customer: HttpTypes.StoreCustomer
}

const ProfileEmail: React.FC<MyInformationProps> = ({ customer }) => {
  return (
    <AccountInfo
      label="Email"
      currentInfo={`${customer.email}`}
      clearState={() => undefined}
      editable={false}
      data-testid="account-email-editor"
    >
      <p className="txt-small text-ui-fg-subtle" data-testid="email-read-only-note">
        Email changes are not available from this profile yet.
      </p>
    </AccountInfo>
  )
}

export default ProfileEmail
