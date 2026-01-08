#!/usr/bin/env python3
"""
Add Phase 20 Swift files to Xcode project.pbxproj

Phase 20 includes:
- DigestView.swift (Digest UI)
- AnalyticsDashboardView.swift (Analytics Dashboard)
- APIService+Phase20.swift (API extensions)
- Widget Extension files

Usage: python3 add_phase20_files.py
"""

import re
import uuid
import os

def generate_uuid():
    return uuid.uuid4().hex[:24].upper()

def add_phase20_files():
    pbxproj_path = "PersonalAIBrain.xcodeproj/project.pbxproj"

    if not os.path.exists(pbxproj_path):
        print(f"Error: {pbxproj_path} not found")
        return

    with open(pbxproj_path, 'r') as f:
        content = f.read()

    # Files to add
    files = [
        {
            "name": "DigestView.swift",
            "path": "PersonalAIBrain/Views/DigestView.swift",
            "group": "Views"
        },
        {
            "name": "AnalyticsDashboardView.swift",
            "path": "PersonalAIBrain/Views/AnalyticsDashboardView.swift",
            "group": "Views"
        },
        {
            "name": "APIService+Phase20.swift",
            "path": "PersonalAIBrain/Services/APIService+Phase20.swift",
            "group": "Services"
        }
    ]

    # Generate UUIDs for each file
    for file in files:
        file['file_ref_uuid'] = generate_uuid()
        file['build_file_uuid'] = generate_uuid()

    # Find existing patterns in the file to ensure we're adding in the right places
    # 1. Add PBXBuildFile entries
    build_file_section_match = re.search(
        r'(/\* Begin PBXBuildFile section \*/\n)',
        content
    )

    if build_file_section_match:
        insert_pos = build_file_section_match.end()
        build_file_entries = ""
        for file in files:
            build_file_entries += f'\t\t{file["build_file_uuid"]} /* {file["name"]} in Sources */ = {{isa = PBXBuildFile; fileRef = {file["file_ref_uuid"]} /* {file["name"]} */; }};\n'

        content = content[:insert_pos] + build_file_entries + content[insert_pos:]
        print(f"Added {len(files)} PBXBuildFile entries")

    # 2. Add PBXFileReference entries
    file_ref_section_match = re.search(
        r'(/\* Begin PBXFileReference section \*/\n)',
        content
    )

    if file_ref_section_match:
        insert_pos = file_ref_section_match.end()
        file_ref_entries = ""
        for file in files:
            file_ref_entries += f'\t\t{file["file_ref_uuid"]} /* {file["name"]} */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {file["name"]}; sourceTree = "<group>"; }};\n'

        content = content[:insert_pos] + file_ref_entries + content[insert_pos:]
        print(f"Added {len(files)} PBXFileReference entries")

    # 3. Add to PBXSourcesBuildPhase
    sources_build_match = re.search(
        r'(files = \(\n)([^\)]+)(\);.*?/\* Sources \*/)',
        content,
        re.DOTALL
    )

    if sources_build_match:
        existing_files = sources_build_match.group(2)
        new_files = ""
        for file in files:
            new_files += f'\t\t\t\t{file["build_file_uuid"]} /* {file["name"]} in Sources */,\n'

        content = content[:sources_build_match.start(2)] + existing_files + new_files + content[sources_build_match.end(2):]
        print(f"Added {len(files)} entries to Sources build phase")

    # 4. Add files to their respective groups
    for file in files:
        group_name = file['group']
        # Find the group and add the file reference
        group_pattern = rf'(/\* {group_name} \*/ = \{{\n\s+isa = PBXGroup;\n\s+children = \(\n)'
        group_match = re.search(group_pattern, content)

        if group_match:
            insert_pos = group_match.end()
            file_entry = f'\t\t\t\t{file["file_ref_uuid"]} /* {file["name"]} */,\n'
            content = content[:insert_pos] + file_entry + content[insert_pos:]
            print(f"Added {file['name']} to {group_name} group")

    # Write back
    with open(pbxproj_path, 'w') as f:
        f.write(content)

    print("\nSuccessfully added Phase 20 files to Xcode project!")
    print("\nNote: To add the Widget Extension, use Xcode:")
    print("  1. File -> New -> Target")
    print("  2. Select 'Widget Extension'")
    print("  3. Name it 'PersonalAIBrainWidgets'")
    print("  4. Copy the widget code from ios/PersonalAIBrainWidgets/")

if __name__ == "__main__":
    add_phase20_files()
