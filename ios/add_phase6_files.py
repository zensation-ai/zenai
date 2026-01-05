#!/usr/bin/env python3
"""Add Phase 6 & 7 files to Xcode project"""
import re
import uuid
import os

PROJECT_PATH = "PersonalAIBrain.xcodeproj/project.pbxproj"

def generate_uuid():
    return uuid.uuid4().hex[:24].upper()

def add_files_to_project():
    with open(PROJECT_PATH, 'r') as f:
        content = f.read()

    # Files to add
    new_files = [
        ("TrainingModels.swift", "Models"),
        ("TrainingView.swift", "Views"),
    ]

    # Generate UUIDs for each file
    file_refs = {}
    build_refs = {}

    for filename, folder in new_files:
        file_refs[filename] = generate_uuid()
        build_refs[filename] = generate_uuid()

    # Check if files already exist
    for filename, _ in new_files:
        if filename in content:
            print(f"  - {filename} already in project")
            continue

    # Find insertion points and add references
    modified = content

    # 1. Add PBXBuildFile entries
    build_file_section = "/* Begin PBXBuildFile section */"
    if build_file_section in modified:
        build_entries = ""
        for filename, _ in new_files:
            if filename not in content:
                build_entries += f"\t\t{build_refs[filename]} /* {filename} in Sources */ = {{isa = PBXBuildFile; fileRef = {file_refs[filename]} /* {filename} */; }};\n"
        modified = modified.replace(
            build_file_section,
            build_file_section + "\n" + build_entries
        )

    # 2. Add PBXFileReference entries
    file_ref_section = "/* Begin PBXFileReference section */"
    if file_ref_section in modified:
        file_entries = ""
        for filename, _ in new_files:
            if filename not in content:
                file_entries += f'\t\t{file_refs[filename]} /* {filename} */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {filename}; sourceTree = "<group>"; }};\n'
        modified = modified.replace(
            file_ref_section,
            file_ref_section + "\n" + file_entries
        )

    # 3. Add to PBXGroup for Models
    # Find Models group and add TrainingModels.swift
    models_group_pattern = r'(\/\* Models \*\/ = \{[^}]*children = \(\s*)'
    models_match = re.search(models_group_pattern, modified)
    if models_match and "TrainingModels.swift" not in content:
        insert_pos = models_match.end()
        modified = modified[:insert_pos] + f'\t\t\t\t{file_refs["TrainingModels.swift"]} /* TrainingModels.swift */,\n' + modified[insert_pos:]

    # 4. Add to PBXGroup for Views
    views_group_pattern = r'(\/\* Views \*\/ = \{[^}]*children = \(\s*)'
    views_match = re.search(views_group_pattern, modified)
    if views_match and "TrainingView.swift" not in content:
        insert_pos = views_match.end()
        modified = modified[:insert_pos] + f'\t\t\t\t{file_refs["TrainingView.swift"]} /* TrainingView.swift */,\n' + modified[insert_pos:]

    # 5. Add to Sources build phase
    sources_pattern = r'(\/\* Sources \*\/ = \{[^}]*files = \(\s*)'
    sources_match = re.search(sources_pattern, modified)
    if sources_match:
        insert_pos = sources_match.end()
        sources_entries = ""
        for filename, _ in new_files:
            if filename not in content:
                sources_entries += f'\t\t\t\t{build_refs[filename]} /* {filename} in Sources */,\n'
        modified = modified[:insert_pos] + sources_entries + modified[insert_pos:]

    # Write back
    if modified != content:
        with open(PROJECT_PATH, 'w') as f:
            f.write(modified)
        print("✅ Successfully added Phase 6 files to Xcode project!")
        for filename, folder in new_files:
            if filename not in content:
                print(f"   - {filename} ({folder})")
    else:
        print("ℹ️  No changes needed - files already in project or patterns not found")

if __name__ == "__main__":
    os.chdir("/Users/alexanderbering/Projects/KI-AB/ios")
    add_files_to_project()
