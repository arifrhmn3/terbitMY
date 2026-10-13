import FamilyControls
import SwiftUI

/// Apple's Screen Time app and category picker, with Cancel and Done.
/// Apple shows the app names; Terbit MY only receives opaque tokens.
struct AppPickerView: View {
  @State var selection: FamilyActivitySelection
  let onFinish: (FamilyActivitySelection?) -> Void

  var body: some View {
    NavigationView {
      FamilyActivityPicker(selection: $selection)
        .navigationTitle("Restrict at night")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("Cancel") { onFinish(nil) }
          }
          ToolbarItem(placement: .confirmationAction) {
            Button("Done") { onFinish(selection) }
          }
        }
    }
    .navigationViewStyle(.stack)
  }
}
